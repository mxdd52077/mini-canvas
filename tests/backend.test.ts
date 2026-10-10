import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {executeQuery} from '../src/lib/backend/database';
import {Query} from '../src/lib/backend/query';
import type {User} from '../src/lib/backend/types';

test('D1 policies isolate projects, reject privilege changes and protect upsert conflicts',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'test-db'},compatibilityDate:'2026-10-10'}));
  try{
    const db=await mf.getD1Database('DB');
    const schema=await readFile(new URL('../cloudflare/migrations/0001_initial.sql',import.meta.url),'utf8');
    await db.exec(schema.replace(/\n/g,' '));
    const owner:User={id:crypto.randomUUID(),email:'owner@example.com',user_metadata:{}};
    const outsider:User={id:crypto.randomUUID(),email:'outsider@example.com',user_metadata:{}};
    for(const user of [owner,outsider])await db.batch([
      db.prepare('INSERT INTO users(id,email,password_hash,salt) VALUES(?,?,?,?)').bind(user.id,user.email,'unused','unused'),
      db.prepare('INSERT INTO profiles(id,email,display_name) VALUES(?,?,?)').bind(user.id,user.email,'Test'),
    ]);
    const client=(user:User)=>({from:(table:string)=>new Query(table,s=>executeQuery(db,user,s))});
    const a=client(owner),b=client(outsider);
    const project=await a.from('projects').insert({owner_id:owner.id,name:'Private'}).single();assert.equal(project.error,null);const id=project.data.id;
    assert.equal((await b.from('projects').select('*')).data.length,0);
    assert.equal((await b.from('projects').update({name:'Hijacked'}).eq('id',id)).data.length,0);
    assert.equal((await a.from('profiles').update({role:'admin'}).eq('id',owner.id)).error?.message,'无权修改此字段');
    assert.ok((await b.from('project_members').insert({project_id:id,user_id:outsider.id,role:'owner'})).error);
    assert.ok((await b.from('canvas_snapshots').insert({project_id:id,created_by:outsider.id,project_version:1,payload:{nodes:[],edges:[]}})).error);
    const viewport=await a.from('project_viewports').upsert({user_id:owner.id,project_id:id,x:1,y:2,zoom:1},{onConflict:'user_id,project_id'});assert.equal(viewport.error,null);
    assert.ok((await b.from('project_viewports').upsert({user_id:owner.id,project_id:id,x:99,y:99,zoom:1},{onConflict:'user_id,project_id'})).error);
    const read=await a.from('project_viewports').select('x').eq('project_id',id).single();assert.equal(read.data.x,1);
    assert.ok((await b.from('assets').insert({project_id:id,owner_id:outsider.id,kind:'image',storage_path:`${id}/x.png`,mime_type:'image/png',byte_size:1,source:'upload'})).error);
    assert.ok((await a.from('projects').eq('id; DROP TABLE users',id)).error);
    assert.equal((await db.prepare('SELECT count(*) AS total FROM users').first<{total:number}>())?.total,2);
  }finally{await mf.dispose();}
});
