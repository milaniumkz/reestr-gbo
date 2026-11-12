import {afterEach,describe,expect,it,jest} from '@jest/globals';
import {createGeocoderLookup} from './geocoder-dns';
import type dns from 'node:dns';

afterEach(()=>jest.useRealTimers());
describe('Geocoder DNS resilience',()=>{
 it('uses the normal IPv4 answer without external DNS',()=>{
  const fallback=jest.fn(async()=>['203.0.113.2']),done=jest.fn();
  const primary=((host:any,options:any,cb:any)=>cb(null,'203.0.113.1',4)) as typeof dns.lookup;
  createGeocoderLookup(primary,fallback)('provider.example',{},done);
  expect(done).toHaveBeenCalledWith(null,'203.0.113.1',4);
  expect(fallback).not.toHaveBeenCalled();
 });
 it('recovers from a stalled DNS server and ignores its late answer',async()=>{
  jest.useFakeTimers();
  let late: any;
  const primary=((host:any,options:any,cb:any)=>{late=cb;}) as typeof dns.lookup;
  const fallback=jest.fn(async()=>['203.0.113.2']),done=jest.fn();
  createGeocoderLookup(primary,fallback)('provider.example',{all:true},done);
  await jest.advanceTimersByTimeAsync(750);
  expect(done).toHaveBeenCalledWith(null,[{address:'203.0.113.2',family:4}],4);
  late(null,'203.0.113.1',4);
  expect(done).toHaveBeenCalledTimes(1);
 });
 it('falls back immediately on a refused DNS request',async()=>{
  const primary=((host:any,options:any,cb:any)=>cb(Object.assign(new Error(),{code:'ECONNREFUSED'}))) as typeof dns.lookup;
  const fallback=jest.fn(async()=>['203.0.113.2']),done=jest.fn();
  createGeocoderLookup(primary,fallback)('provider.example',{},done);
  await Promise.resolve();
  expect(done).toHaveBeenCalledWith(null,'203.0.113.2',4);
 });
 it('returns an error if neither DNS source can resolve the hostname',async()=>{
  const primary=((host:any,options:any,cb:any)=>cb(new Error('primary failed'))) as typeof dns.lookup;
  const done=jest.fn();
  createGeocoderLookup(primary,async()=>{throw Object.assign(new Error(),{code:'ETIMEOUT'});})('provider.example',{},done);
  await Promise.resolve();
  expect(done).toHaveBeenCalledWith(expect.objectContaining({code:'ETIMEOUT'}),'',4);
 });
});
