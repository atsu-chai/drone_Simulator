import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Isolated public-page fixture. No accounts, private mission module, or billing routes.
createServer((req,res)=>{
  if(req.method!=='GET') {res.writeHead(405);res.end();return;}
  const path=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(path==='/api/status') {res.setHeader('Content-Type','application/json');res.end('{"access":false}');return;}
  if(path==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(new URL('./layout-preview.html',import.meta.url)));return;}
  let filePath;
  try {filePath=decodeURIComponent(path.replace(/^\/preview\//,'/'));}catch {res.writeHead(400);res.end();return;}
  if(!path.startsWith('/preview/') || filePath.includes('..') || (filePath==='/src/premium-mission.js'||filePath.startsWith('/src/exam-')) || !/^\/(?:index\.html|app\.js|styles\.css|site\.css|src\/[a-z-]+\.js|assets\/[a-zA-Z0-9_./-]+)$/.test(filePath)) {res.writeHead(404);res.end();return;}
  try {
    const data=readFileSync(resolve(root,`.${filePath}`));
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary','.hdr':'application/octet-stream'})[extname(filePath)]||'application/octet-stream');res.end(data);
  } catch {res.writeHead(404);res.end();}
}).listen(Number(process.env.DRONE_LAYOUT_PORT||8001),'127.0.0.1',()=>console.log('Layout check: http://localhost:8001'));
