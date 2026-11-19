import * as service from '../services/verification.service.js';
import * as validator from '../validators/verification.validator.js';
import {validatePathId} from '../validators/common.validator.js';
const reply=(req,res,data,meta={})=>res.json({data,meta:{...meta,userId:req.userId}});
export async function submit(req,res) {res.status(201);reply(req,res,await service.submit(req.app.locals.pool,req.userId,validator.submission(req.body)));}
export async function list(req,res) {
  const query=validator.query(req.query);
  const result=await service.list(req.app.locals.pool,req.userId,query,req.verificationAdmin===true);
  reply(req,res,result.data,result.meta);
}
export async function detail(req,res) {reply(req,res,await service.detail(req.app.locals.pool,req.userId,validatePathId(req.params.id),req.verificationAdmin===true));}
export async function change(req,res) {
  const mode=req.verificationAdmin?(req.path.endsWith('/revoke')?'revoke':'decision'):'withdraw';
  reply(req,res,await service.decide(req.app.locals.pool,req.userId,validatePathId(req.params.id),validator.action(req.body,mode),req.verificationAdmin===true));
}
