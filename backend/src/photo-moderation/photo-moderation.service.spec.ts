import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PhotoModerationService } from './photo-moderation.service';

describe('Inspection photo moderation',()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const saved = {key:process.env.OPENAI_API_KEY,mode:process.env.PHOTO_MODERATION_MODE,model:process.env.PHOTO_MODERATION_MODEL};
  beforeEach(()=>{delete process.env.OPENAI_API_KEY;delete process.env.PHOTO_MODERATION_MODE;delete process.env.PHOTO_MODERATION_MODEL;});
  afterEach(()=>{jest.restoreAllMocks();for (const [name,value] of Object.entries({OPENAI_API_KEY:saved.key,PHOTO_MODERATION_MODE:saved.mode,PHOTO_MODERATION_MODEL:saved.model})) {if(value===undefined)delete process.env[name];else process.env[name]=value;}});
  const result=(decision:string,reason:string)=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({decision,reason})}]}]});
  it('does not pretend that photos passed moderation before a key is configured',async()=>{
    expect(await new PhotoModerationService().check(png,'photo.png','tech_passport')).toEqual({moderationStatus:'not_configured'});
  });
  it('blocks missing configuration when explicitly required',async()=>{
    process.env.PHOTO_MODERATION_MODE='required';
    await expect(new PhotoModerationService().check(png,'photo.png','tech_passport')).rejects.toThrow('не настроена');
  });
  it('sends the actual image with storage disabled and records a verified approval',async()=>{
    process.env.OPENAI_API_KEY='test-only';
    const fetch=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(result('allow','original'))));
    const checked=await new PhotoModerationService().check(png,'photo.png','tech_passport');
    expect(checked.moderationStatus).toBe('approved');
    const body=JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.store).toBe(false);
    expect(body.input[0].content[1].image_url).toBe(`data:image/png;base64,${png.toString('base64')}`);
  });
  it.each([['reject','screen_recapture'],['reject','screenshot'],['review','uncertain']])('rejects %s / %s',async(decision,reason)=>{
    process.env.OPENAI_API_KEY='test-only';jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(result(decision,reason))));
    await expect(new PhotoModerationService().check(png,'photo.png','tech_passport')).rejects.toThrow();
  });
  it.each([new Response('unavailable',{status:503}),new Response('{"status":"incomplete"}'),new Response('invalid json')])('fails closed when the provider is unavailable or returns an invalid answer',async response=>{
    process.env.OPENAI_API_KEY='test-only';jest.spyOn(globalThis,'fetch').mockResolvedValue(response);
    await expect(new PhotoModerationService().check(png,'photo.png','tech_passport')).rejects.toThrow('временно недоступна');
  });
  it('checks PDF pages as file input instead of trusting the filename',async()=>{
    process.env.OPENAI_API_KEY='test-only';const fetch=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(result('reject','screen_recapture'))));
    await expect(new PhotoModerationService().check(Buffer.from('%PDF-1.7'),'scan.pdf','gas_work_record')).rejects.toThrow('Фото экрана');
    const body=JSON.parse(fetch.mock.calls[0][1]!.body as string);expect(body.input[0].content[1].type).toBe('input_file');
  });
});
