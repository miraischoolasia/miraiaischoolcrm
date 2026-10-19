select json_build_object(
 'classrooms',(select json_agg(json_build_object('id',c.id,'name',c.name,'age',c.age_group,'level',c.program_level,'cat',c.category,'teacher',c.teacher_id,'status',c.status,'arch',c.archived_at is not null,'subject',c.subject_id,'zoom',c.zoom_link is not null and c.zoom_link<>'','extra_t',(select json_agg(teacher_id) from classroom_teachers ct where ct.classroom_id=c.id),
   'students',(select count(*) from students s where s.classroom_id=c.id)) order by c.id) from classrooms c),
 'teachers',(select json_agg(json_build_object('id',t.id,'username',t.username,'name',t.full_name,'role',t.role,'active',t.is_active,'zoom',t.zoom_host_user is not null)) from teachers t),
 'subjects',(select json_agg(json_build_object('id',id,'name',name,'active',is_active)) from subjects),
 'schedules',(select count(*) from schedules),
 'zoom_hosts',(select value->'per_host' from app_settings where key='zoom_hosts'),
 'zoom_hosts_n',(select jsonb_array_length(coalesce(value->'hosts','[]'::jsonb)) from app_settings where key='zoom_hosts')
) j;
