import {readdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const dir=new URL('./knowledge/',import.meta.url);
const expected={"national-sections.json":null,"sections.json":null};
for(const name of Object.keys(expected)){const parts=(await readdir(dir)).filter(n=>n.startsWith(name+'.gz.b64part')).sort();if(!parts.length)throw Error('Missing archive: '+name);const text=(await Promise.all(parts.map(n=>readFile(new URL(n,dir),'utf8')))).join('');const data=gunzipSync(Buffer.from(text,'base64'));JSON.parse(data.toString('utf8'));await writeFile(new URL(name,dir),data);console.log('Restored '+name+' SHA256 '+createHash('sha256').update(data).digest('hex'));}
