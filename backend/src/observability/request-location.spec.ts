import {describe,it,expect} from '@jest/globals';
import {requestLocation} from './request-location';
describe('client location evidence',()=>{
 const now=Date.now();const valid={'x-location-state':'available','x-location-lat':'51.2','x-location-lng':'71.4','x-location-accuracy':'12','x-location-at':new Date(now).toISOString()};
 it('records coordinates with accuracy, timestamp and client-reported source',()=>expect(requestLocation(valid,now)).toMatchObject({state:'available',lat:51.2,lng:71.4,accuracy:12,source:'client_reported'}));
 it.each([{'x-location-lat':'999'},{'x-location-lng':'Infinity'},{'x-location-at':new Date(now-3600000).toISOString()},{'x-location-accuracy':'-3'},{'x-location-at':new Date(now+120000).toISOString()}])('rejects invalid or stale coordinates %p',override=>expect(requestLocation({...valid,...override},now)).toEqual({state:'invalid_or_stale',source:'client_reported'}));
 it('does not invent a location for denied or old clients',()=>{expect(requestLocation({'x-location-state':'denied'},now)).toEqual({state:'denied',source:'client_reported'});expect(requestLocation({},now)).toMatchObject({state:'not_provided'});});
});
