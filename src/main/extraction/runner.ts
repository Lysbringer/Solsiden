import type { UtilityProcess } from 'electron';
export class ExtractionRunner {
 private active?: {id:string;cancel:()=>void};
 constructor(private create:(url:string)=>Pick<UtilityProcess,'once'|'kill'>,private timeout=45000){}
 run(url:string,id:string):Promise<unknown> {
  if(this.active)return Promise.reject(Error('An extraction is already running.'));
  return new Promise((resolve,reject)=>{
   const worker=this.create(url);let settled=false;
   const finish=(error?:Error,result?:unknown)=>{
    if(settled)return;settled=true;clearTimeout(timer);this.active=undefined;worker.kill();error?reject(error):resolve(result);
   };
   const timer=setTimeout(()=>finish(Error('Extraction timed out after 45 seconds.')),this.timeout);
   this.active={id,cancel:()=>finish(Error('Extraction cancelled.'))};
   worker.once('message',message=>finish(message.error?Error(message.error):undefined,message.result));
   worker.once('exit',()=>finish(Error('Extraction process stopped.')));
  });
 }
 cancel(id:string){if(this.active?.id===id)this.active.cancel();}
}
