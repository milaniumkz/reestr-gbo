import {accountContext} from './account-context';
import {requestContext} from './request-context';
describe('достоверный контекст аккаунта',()=>{
 it('сохраняет целевой аккаунт, но не считает неудачный вход подтверждённым',()=>{const request:any={};requestContext.run({id:'request-one',started:0,request},()=>{accountContext({actorId:'known-user',verified:false});accountContext({verified:false,reasonCode:'credentials_invalid'});});expect(request.accountContext).toEqual({actorId:'known-user',verified:false,reasonCode:'credentials_invalid'});});
 it('не переносит пользователя между одновременными запросами',async()=>{const first:any={},second:any={};await Promise.all([requestContext.run({id:'one',started:0,request:first},async()=>{accountContext({actorId:'first',verified:true});await Promise.resolve();expect(requestContext.getStore()?.request.accountContext.actorId).toBe('first');}),requestContext.run({id:'two',started:0,request:second},async()=>{await Promise.resolve();accountContext({actorId:'second',verified:false});})]);expect(first.accountContext.actorId).toBe('first');expect(second.accountContext.actorId).toBe('second');});
});
