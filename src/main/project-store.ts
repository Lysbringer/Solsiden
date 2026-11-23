import fs from 'node:fs';
import type { Database } from 'sql.js';
import type { Project } from '../shared/types';
import { normalizeProject } from '../shared/project';
export class ProjectStore {
 constructor(private db: Database, private file: string) { db.run('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)'); }
 list(): Project[] { const rows = this.db.exec('SELECT data FROM projects'); return rows.length ? rows[0].values.map(row => normalizeProject(JSON.parse(String(row[0])))) : []; }
 save(input: Project): Project {
  const project = normalizeProject(input); project.updatedAt = new Date().toISOString();
  const temp = this.file + '.tmp';
  const previous = this.db.exec('SELECT data FROM projects WHERE id = ?', [project.id]);
  this.db.run('BEGIN');
  try {
   this.db.run('INSERT OR REPLACE INTO projects VALUES (?, ?)', [project.id, JSON.stringify(project)]);
   // Export commits the sql.js transaction; retain a snapshot for rollback on I/O failure.
   this.db.run('COMMIT');
  } catch (error) { this.db.run('ROLLBACK'); throw error; }
  try { return this.persist(project, temp); }
  catch (error) {
   if (previous.length) this.db.run('INSERT OR REPLACE INTO projects VALUES (?, ?)', [project.id, String(previous[0].values[0][0])]);
   else this.db.run('DELETE FROM projects WHERE id = ?', [project.id]);
   throw error;
  }
 }
 delete(id:string):void {this.deleteMany([id]);}
 deleteMany(ids:string[]):void {
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>128))throw Error('Invalid article IDs');
  const unique=[...new Set(ids)];const previous:{id:string;rowid:number;data:string}[]=[];
  for(const id of unique){const rows=this.db.exec('SELECT rowid,data FROM projects WHERE id = ?',[id]);if(!rows.length)throw Error('An article no longer exists. No articles were deleted. Refresh the library.');previous.push({id,rowid:Number(rows[0].values[0][0]),data:String(rows[0].values[0][1])});}
  this.db.run('BEGIN');try{for(const id of unique)this.db.run('DELETE FROM projects WHERE id = ?',[id]);this.db.run('COMMIT');}catch(error){this.db.run('ROLLBACK');throw Error('Deletion failed; no articles were deleted: '+String(error));}
  try{this.persist(undefined,this.file+'.tmp');}catch(error){this.db.run('BEGIN');try{for(const row of previous)this.db.run('INSERT INTO projects(rowid,id,data) VALUES (?, ?, ?)',[row.rowid,row.id,row.data]);this.db.run('COMMIT');}catch(restoreError){this.db.run('ROLLBACK');throw Error('Database recovery failed. Restart to reload the unchanged saved database: '+String(restoreError));}throw Error('Deletion could not be saved; no articles were deleted: '+String(error));}
 }
 private persist<T>(project: T, temp: string) {
  const fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, this.db.export()); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Retain the last known disk database before replacing it. Never auto-recover.
  if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
  fs.renameSync(temp, this.file);
  return project;
 }
}
