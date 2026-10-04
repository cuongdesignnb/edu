import tls from 'node:tls';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Loopback-only TLS SMTP fixture. Never contacts a real provider or prints mail. */
export async function controlledSmtp(){
 const root=process.env.SMTP_TEST_CERT_ROOT??path.resolve('.runtime');
 const sockets=new Set(),state={username:'synthetic-user',password:'synthetic-password',fail:false,messages:[],auths:[],tls:[]};
 const server=tls.createServer({cert:await fs.readFile(path.join(root,'smtp-test.crt')),key:await fs.readFile(path.join(root,'smtp-test.key')),minVersion:'TLSv1.2'},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});state.tls.push(socket.getProtocol());
  let buffer='',data=false,body='',auth=false;
  socket.write('220 localhost controlled SMTP\r\n');
  socket.on('data',chunk=>{
   buffer+=chunk.toString();let index;
   while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
    if(data){if(line==='.'){data=false;state.messages.push(body);body='';socket.write('250 accepted\r\n');}else body+=line+'\r\n';continue;}
    if(/^EHLO|^HELO/i.test(line)){socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 100000\r\n');continue;}
    if(/^AUTH PLAIN /i.test(line)){const [,username,password]=Buffer.from(line.split(' ')[2],'base64').toString().split('\0');state.auths.push({username,password});auth=!state.fail&&username===state.username&&password===state.password;
     socket.write(auth?'235 authenticated\r\n':'535 raw-private-credential #token=must-not-leak\r\n');continue;}
    if(/^MAIL FROM|^RCPT TO/i.test(line)){socket.write(auth?'250 accepted\r\n':'530 auth required\r\n');continue;}
    if(/^DATA/i.test(line)){data=true;socket.write('354 send message\r\n');continue;}
    if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');continue;}
    socket.write('250 ok\r\n');
   }
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {state,port:server.address().port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
