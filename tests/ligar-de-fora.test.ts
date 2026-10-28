import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharServicoWan, argsDaPorta, buscaSsdp, campoSoap, diagnosticarNat, envelopeSoap, ipNaoPublico, lerRespostaSsdp } from '../src/main/logica/upnp.ts'

const RESPOSTA = 'HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\nLocation: http://192.168.0.1:1900/igd.xml\r\nSERVER: Linux UPnP/1.0\r\n\r\n'

// Descrição no formato dos roteadores comuns (TP-Link, ASUS, roteadores de operadora)
const XML = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
 <device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType>
  <serviceList><service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><controlURL>/l3f</controlURL></service></serviceList>
  <deviceList><device><deviceType>urn:schemas-upnp-org:device:WANDevice:1</deviceType>
   <deviceList><device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:1</deviceType>
    <serviceList>
     <service><serviceType>urn:schemas-upnp-org:service:WANPPPConnection:1</serviceType><controlURL>/ppp</controlURL></service>
     <service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId><controlURL>/upnp/control/WANIPConn1</controlURL></service>
    </serviceList></device></deviceList></device></deviceList>
 </device>
</root>`

test('lê o endereço do roteador na resposta SSDP', () => {
  assert.equal(lerRespostaSsdp(RESPOSTA), 'http://192.168.0.1:1900/igd.xml')
  assert.equal(lerRespostaSsdp('HTTP/1.1 200 OK\r\n\r\n'), null)
  assert.match(buscaSsdp('urn:x'), /^M-SEARCH \* HTTP\/1\.1\r\n[\s\S]*ST: urn:x\r\n\r\n$/)
})

test('acha o serviço que abre portas (IP antes de PPP)', () => {
  assert.deepEqual(acharServicoWan(XML, 'http://192.168.0.1:1900/igd.xml'), {
    servico: 'urn:schemas-upnp-org:service:WANIPConnection:1',
    controle: 'http://192.168.0.1:1900/upnp/control/WANIPConn1'
  })
  assert.equal(acharServicoWan('<root></root>', 'http://x/'), null)
  // URLBase manda no endereço
  const comBase = XML.replace('<device>', '<URLBase>http://192.168.0.1:5000/</URLBase><device>')
  assert.equal(acharServicoWan(comBase, 'http://192.168.0.1:1900/igd.xml')?.controle, 'http://192.168.0.1:5000/upnp/control/WANIPConn1')
})

test('pedido SOAP para abrir a porta', () => {
  const env = envelopeSoap('urn:schemas-upnp-org:service:WANIPConnection:1', 'AddPortMapping', argsDaPorta(40009, 9, '192.168.0.20'))
  assert.match(env, /<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">/)
  assert.match(env, /<NewExternalPort>40009<\/NewExternalPort><NewProtocol>UDP<\/NewProtocol><NewInternalPort>9<\/NewInternalPort><NewInternalClient>192\.168\.0\.20<\/NewInternalClient>/)
  assert.match(env, /<NewLeaseDuration>0<\/NewLeaseDuration>/)
  assert.equal(campoSoap('<s:Body><u:GetExternalIPAddressResponse><NewExternalIPAddress>189.10.20.30</NewExternalIPAddress></u:GetExternalIPAddressResponse></s:Body>', 'NewExternalIPAddress'), '189.10.20.30')
  assert.equal(campoSoap('<UPnPError><errorCode>718</errorCode></UPnPError>', 'errorCode'), '718')
})

test('descobre CGNAT', () => {
  assert.equal(diagnosticarNat('189.10.20.30', '189.10.20.30'), 'ok')
  assert.equal(diagnosticarNat('100.72.1.5', '177.1.2.3'), 'cgnat')
  assert.equal(diagnosticarNat('189.10.20.30', '177.1.2.3'), 'cgnat')
  assert.equal(diagnosticarNat('', '177.1.2.3'), 'desconhecido')
  assert.equal(diagnosticarNat('100.70.1.2', ''), 'cgnat')
  assert.equal(ipNaoPublico('192.168.0.1'), true)
  assert.equal(ipNaoPublico('8.8.8.8'), false)
})
