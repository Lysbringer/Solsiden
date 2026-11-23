import { extractArticle, extractionError, previewImage } from './pipeline';
const port=(process as unknown as {parentPort:{postMessage:(value:unknown)=>void}}).parentPort;
(process.argv[3]==='image'?previewImage(process.argv[2]):extractArticle(process.argv[2])).then(result=>port.postMessage({result}),error=>port.postMessage({error:extractionError(error)}));
