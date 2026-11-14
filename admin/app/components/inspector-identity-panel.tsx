'use client';
import {useEffect,useRef,useState} from 'react';
import {getInspectorIdentity,resetInspectorIdentity,inspectorIdentityVideo,InspectorIdentityInfo} from '@/lib/api';

export function InspectorIdentityPanel({token,userId}:{token:string;userId:string}) {
  const [data,setData]=useState<InspectorIdentityInfo|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [reason,setReason]=useState('');
  const [video,setVideo]=useState('');
  const active=useRef(true), objectUrl=useRef('');
  useEffect(()=>{
    active.current=true;
    return ()=>{active.current=false;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};
  },[]);
  useEffect(()=>{
    let current=true;
    getInspectorIdentity(token,userId).then(value=>{if(current)setData(value);})
      .catch(cause=>{if(current)setError(cause.message);});
    return ()=>{current=false;};
  },[token,userId]);
  async function showVideo(challengeId?:string) {
    setBusy(true);setError('');
    try {
      const blob=await inspectorIdentityVideo(token,userId,challengeId);
      if(!active.current)return;
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
      objectUrl.current=URL.createObjectURL(blob);setVideo(objectUrl.current);
    } catch(cause) {
      if(active.current)setError(cause instanceof Error?cause.message:'Не удалось открыть видео');
    } finally {if(active.current)setBusy(false);}
  }
  async function reset() {
    if(!reason.trim())return;
    setBusy(true);setError('');
    try {
      await resetInspectorIdentity(token,userId,reason.trim());
      const updated=await getInspectorIdentity(token,userId);
      if(!active.current)return;
      setData(updated);setVideo('');setReason('');
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
      objectUrl.current='';
    } catch(cause) {
      if(active.current)setError(cause instanceof Error?cause.message:'Сброс не выполнен');
    } finally {if(active.current)setBusy(false);}
  }
  return <section className="detailPanel">
    <h3>Видеоидентификация инспектора</h3>
    {error&&<p role="alert">{error}</p>}
    {data&&<>
      <p>{data.enrolled?`Эталон зарегистрирован ${new Date(data.enrolledAt!).toLocaleString('ru-RU')}`:'Эталон ещё не зарегистрирован'}</p>
      {data.enrolled&&<button type="button" disabled={busy} onClick={()=>void showVideo()}>Первичная видеозапись</button>}
      {video&&<video src={video} controls playsInline style={{width:'100%',maxWidth:480}} aria-label="Запись видеоидентификации"/>}
      <p>Сброс удаляет привязку лица и завершает все сессии этого сотрудника. Следующий вход создаст новый эталон.</p>
      <label>Причина сброса<input value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} /></label>
      <button type="button" disabled={busy||!reason.trim()||!data.enrolled} onClick={()=>void reset()}>Сбросить видеоидентификацию и сеансы</button>
      <table><thead><tr><th>Дата</th><th>Проверка</th><th>Результат</th><th>Запись</th></tr></thead>
        <tbody>{data.history.map(row=><tr key={row.id}>
          <td>{new Date(row.createdAt).toLocaleString('ru-RU')}</td><td>{row.purpose==='ENROLL'?'Первичная':'Вход'}</td>
          <td>{row.status==='VERIFIED'?'Подтверждено':row.reason??row.status}</td>
          <td>{row.hasVideo&&<button type="button" disabled={busy} onClick={()=>void showVideo(row.id)}>Смотреть</button>}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </section>;
}
