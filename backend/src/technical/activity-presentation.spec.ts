import {activityPresentation,actionName,problemName} from './activity-presentation';
describe('понятная история проблем',()=>{
 it('не объявляет неизвестный отказ истёкшим сеансом',()=>{const result=activityPresentation({action:'GET /api/v1/technical/overview',result:'denied',details:{statusCode:401}});expect(result.actionLabel).toBe('Просмотр обзора технической панели');expect(result.message).toContain('Точная причина');expect(result.message).not.toContain('истёк');});
 it('показывает подтверждённую причину отдельно от сообщения пользователю',()=>{const result=activityPresentation({action:'GET /api/v1/inspections',details:{statusCode:401,reasonCode:'session_expired',message:'Войдите в систему',verified:false}});expect(result.message).toContain('истёк');expect(result.clientMessage).toBe('Войдите в систему');expect(result.verified).toBe(false);});
 it('отличает неверные данные входа от успешного входа',()=>{expect(activityPresentation({action:'POST /api/v1/auth/login',details:{statusCode:401,reasonCode:'credentials_invalid'}}).message).toContain('Личность вошедшего не подтверждена');expect(actionName('auth.login')).toBe('Вход в приложение');});
 it('не называет единичный отказ повторной атакой',()=>{expect(problemName({code:'401',route:'/api/v1/technical/overview'})).not.toContain('Повторные');});
 it('очищает секрет в диагностическом сообщении',()=>{expect(activityPresentation({action:'POST /api/v1/auth/login',details:{message:'password=PrivatePassword token=PrivateToken'}}).message).not.toContain('Private');});
});
