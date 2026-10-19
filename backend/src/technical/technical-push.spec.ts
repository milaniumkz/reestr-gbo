import {describe,it,expect} from '@jest/globals';
import {validPushEndpoint} from './technical-push.service';
describe('push subscription destinations',()=>{
 it.each(['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/endpoint'])('allows supported browser push services %s',url=>expect(validPushEndpoint(url)).toBe(true));
 it.each(['http://fcm.googleapis.com/secret','https://localhost/secret','https://127.0.0.1/a','https://fcm.googleapis.com.evil.example/a','https://name:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','file:///etc/passwd'])('refuses arbitrary server requests %s',url=>expect(validPushEndpoint(url)).toBe(false));
});
