import json, uuid
from pathlib import Path
from datetime import datetime, timedelta
uid='c0514d9b-b864-4394-b2d7-f012cabe0030'
day=datetime.now().strftime('%Y-%m-%d'); now=day+'T06:00:00.000Z'
def ident(): return str(uuid.uuid4())
def task(title,time,duration,category='personal',done=False,kind='task'):
 return dict(id=ident(),user_id=uid,title=title,type=kind,category=category,start_time=time,duration=duration,repeat_type='daily' if kind=='habit' else 'none',completed=done,completed_at=(day+'T08:30:00.000Z') if done else None,scheduled_date=None if kind=='habit' else day,created_at=now,updated_at=now,overdue_notified=True)
doc=dict(version=5,userId=uid,ownerEmail=None,tasks=[task('Morning stretch','08:00',15,'fitness',True),task('Finish the design proposal','09:00',60,'work',True),task('Pick up fresh groceries','13:30',30,'grocery'),task('Full-body strength','15:00',45,'fitness'),task('Read a few pages','19:30',20,'personal')],settings=dict(theme='white',smartReminders=False,notifications=False,onboardingStatus='completed',planningWindow=dict(startTime='08:00',endTime='22:00',transitionBufferMinutes=10)),goals=[],calorieEntries=[],workoutSessions=[],workoutPlans=[],weightEntries=[])
for module,statement,context in [('whole_day','Make room for work and life','Finish the important work, then leave space to recharge.'),('habits','Build a calmer evening routine','Read a little and wind down before bed.'),('workouts','Feel stronger every week','Three steady sessions, with room for recovery.'),('nutrition','Eat well through a busy day','Simple meals with plenty of variety.')]:
 doc['goals'].append(dict(id=ident(),user_id=uid,module=module,statement=statement,context=context,created_at=now,updated_at=now,deleted_at=None))
for title,time,cal,p,c,f,q in [('Yogurt, berries & granola','08:30',380,22,48,11,'1 bowl'),('Chicken & quinoa salad','12:30',560,42,55,18,'1 plate'),('Apple & almond butter','16:00',210,5,25,11,'1 snack')]:
 doc['calorieEntries'].append(dict(id=ident(),userId=uid,date=day,time=time,name=title,calories=cal,protein=p,carbs=c,fat=f,quantity=q,createdAt=now,updatedAt=now))
planid=ident(); exercises=[]
for pos,(name,sets,reps,kg) in enumerate([('Goblet squat',3,10,16),('Dumbbell row',3,12,12),('Romanian deadlift',3,10,20),('Plank',3,None,None)]):
 exercises.append(dict(id=ident(),planId=planid,name=name,sets=sets,reps=reps,weightKg=kg,durationMinutes=1 if name=='Plank' else None,distanceKm=None,notes=None,position=pos))
doc['workoutPlans'].append(dict(id=planid,userId=uid,name='Full-body strength',color='#779E8C',note='A little stronger, one session at a time.',position=0,exercises=exercises,createdAt=now,updatedAt=now))
for ago,title in [(0,'Morning mobility'),(1,'Full-body strength'),(3,'Upper body'),(5,'Full-body strength')]:
 sid=ident(); date=(datetime.now()-timedelta(days=ago)).strftime('%Y-%m-%d')
 doc['workoutSessions'].append(dict(id=sid,userId=uid,date=date,title=title,notes='Steady pace. Good form.',exercises=[{**{k:v for k,v in e.items() if k!='planId'},'id':ident(),'sessionId':sid} for e in exercises],createdAt=date+'T17:00:00.000Z',updatedAt=date+'T17:00:00.000Z'))
Path('output/app-store/v1/screenshots/sample-day.json').write_text(json.dumps(doc,indent=2))
print('Synthetic day generated:',day)
