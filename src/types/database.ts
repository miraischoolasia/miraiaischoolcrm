export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      classrooms: {
        Row: {
          category: 'regular' | 'trial' | 'camp'
          id: number
          name: string
          age_group:
            | '6-8 Years Old'
            | '9-11 Years Old'
            | '12-14 Years Old'
            | '15-17 Years Old'
          program_level:
            | 'Coder Foundation'
            | 'Coder Pro'
            | 'VibeTech Innovator'
            | 'VibeTech Pro'
            | 'VibeTech Future'
            | 'Software Engineer'
          teacher_id: number | null
          status: 'active' | 'archived'
          notes: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          category?: 'regular' | 'trial' | 'camp'
          id?: number
          name: string
          age_group:
            | '6-8 Years Old'
            | '9-11 Years Old'
            | '12-14 Years Old'
            | '15-17 Years Old'
          program_level:
            | 'Coder Foundation'
            | 'Coder Pro'
            | 'VibeTech Innovator'
            | 'VibeTech Pro'
            | 'VibeTech Future'
            | 'Software Engineer'
          teacher_id?: number | null
          status?: 'active' | 'archived'
          notes?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category?: 'regular' | 'trial' | 'camp'
          id?: number
          name?: string
          age_group?:
            | '6-8 Years Old'
            | '9-11 Years Old'
            | '12-14 Years Old'
            | '15-17 Years Old'
          program_level?:
            | 'Coder Foundation'
            | 'Coder Pro'
            | 'VibeTech Innovator'
            | 'VibeTech Pro'
            | 'VibeTech Future'
            | 'Software Engineer'
          teacher_id?: number | null
          status?: 'active' | 'archived'
          notes?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'classrooms_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      teachers: {
        Row: {
          id: number
          auth_user_id: string | null
          username: string
          password_hash: string | null
          full_name: string
          email: string | null
          phone: string | null
          role: 'admin' | 'teacher' | 'staff'
          is_active: boolean
          permissions: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          auth_user_id?: string | null
          username: string
          password_hash?: string | null
          full_name: string
          email?: string | null
          phone?: string | null
          role?: 'admin' | 'teacher' | 'staff'
          is_active?: boolean
          permissions?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          auth_user_id?: string | null
          username?: string
          password_hash?: string | null
          full_name?: string
          email?: string | null
          phone?: string | null
          role?: 'admin' | 'teacher' | 'staff'
          is_active?: boolean
          permissions?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_activity_logs: {
        Row: {
          id: number
          actor_teacher_id: number | null
          action_type: string
          entity_type: 'student' | 'teacher' | 'classroom' | 'schedule' | 'lead'
          entity_id: number | null
          entity_label: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: number
          actor_teacher_id?: number | null
          action_type: string
          entity_type: 'student' | 'teacher' | 'classroom' | 'schedule' | 'lead'
          entity_id?: number | null
          entity_label: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: number
          actor_teacher_id?: number | null
          action_type?: string
          entity_type?: 'student' | 'teacher' | 'classroom' | 'schedule' | 'lead'
          entity_id?: number | null
          entity_label?: string
          details?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_activity_logs_actor_teacher_id_fkey'
            columns: ['actor_teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      students: {
        Row: {
          id: number
          teacher_id: number | null
          classroom_id: number | null
          full_name: string
          phone: string | null
          age: number | null
          remaining_hours: number
          lesson_expiry_date: string
          account_fee_expiry_date: string
          mirai_club_expiry_date: string
          notes: string | null
          is_active: boolean
          student_type: 'trial' | 'preview' | 'regular'
          package_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          teacher_id?: number | null
          classroom_id?: number | null
          full_name: string
          phone?: string | null
          age?: number | null
          remaining_hours?: number
          lesson_expiry_date: string
          account_fee_expiry_date: string
          mirai_club_expiry_date: string
          notes?: string | null
          is_active?: boolean
          student_type?: 'trial' | 'preview' | 'regular'
          package_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          teacher_id?: number | null
          classroom_id?: number | null
          full_name?: string
          phone?: string | null
          age?: number | null
          remaining_hours?: number
          lesson_expiry_date?: string
          account_fee_expiry_date?: string
          mirai_club_expiry_date?: string
          notes?: string | null
          is_active?: boolean
          student_type?: 'trial' | 'preview' | 'regular'
          package_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'students_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'students_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          id: number
          name: string
          kind: 'trial' | 'regular' | 'camp'
          class_count: number
          duration_months: number
          includes_fees: boolean
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          kind: 'trial' | 'regular' | 'camp'
          class_count: number
          duration_months: number
          includes_fees?: boolean
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          kind?: 'trial' | 'regular' | 'camp'
          class_count?: number
          duration_months?: number
          includes_fees?: boolean
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      student_classroom_periods: {
        Row: {
          id: number
          student_id: number
          classroom_id: number
          start_date: string | null
          end_date: string | null
          created_at: string
        }
        Insert: {
          id?: number
          student_id: number
          classroom_id: number
          start_date?: string | null
          end_date?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          student_id?: number
          classroom_id?: number
          start_date?: string | null
          end_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      student_enrollments: {
        Row: {
          id: number
          student_id: number
          package_id: number
          start_date: string
          end_date: string
          class_count: number
          remark: string | null
          actor_teacher_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          student_id: number
          package_id: number
          start_date: string
          end_date: string
          class_count: number
          remark?: string | null
          actor_teacher_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          student_id?: number
          package_id?: number
          start_date?: string
          end_date?: string
          class_count?: number
          remark?: string | null
          actor_teacher_id?: number | null
          created_at?: string
        }
        Relationships: []
      }
      lead_options: {
        Row: {
          id: number
          kind: 'source' | 'pic' | 'tag' | 'check'
          label: string
          is_active: boolean
          legacy_key: string | null
          color: string | null
          created_at: string
        }
        Insert: {
          id?: number
          kind: 'source' | 'pic' | 'tag' | 'check'
          label: string
          is_active?: boolean
          legacy_key?: string | null
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          kind?: 'source' | 'pic' | 'tag' | 'check'
          label?: string
          is_active?: boolean
          legacy_key?: string | null
          color?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lead_source_rules: {
        Row: {
          id: number
          phrase: string
          source_id: number | null
          tag_ids: number[]
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          phrase: string
          source_id?: number | null
          tag_ids?: number[]
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          phrase?: string
          source_id?: number | null
          tag_ids?: number[]
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          id: number
          title: string
          messages: string[]
          media: Json
          steps: Json
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          title: string
          messages?: string[]
          media?: Json
          steps?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          title?: string
          messages?: string[]
          media?: Json
          steps?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_receipts: {
        Row: {
          id: number
          lead_id: number
          file_path: string
          file_name: string
          size_bytes: number
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          lead_id: number
          file_path: string
          file_name: string
          size_bytes: number
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          lead_id?: number
          file_path?: string
          file_name?: string
          size_bytes?: number
          added_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lead_zoom_meetings: {
        Row: {
          id: number
          lead_id: number
          starts_at: string
          link: string
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          lead_id: number
          starts_at: string
          link: string
          added_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          lead_id?: number
          starts_at?: string
          link?: string
          added_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          id: number
          kind: 'contact' | 'parent' | 'student'
          full_name: string | null
          phone: string | null
          email: string | null
          chatwoot_contact_id: number | null
          parent_id: number | null
          lead_id: number | null
          student_id: number | null
          auth_user_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          kind?: 'contact' | 'parent' | 'student'
          full_name?: string | null
          phone?: string | null
          email?: string | null
          chatwoot_contact_id?: number | null
          parent_id?: number | null
          lead_id?: number | null
          student_id?: number | null
          auth_user_id?: string | null
          notes?: string | null
        }
        Update: {
          kind?: 'contact' | 'parent' | 'student'
          full_name?: string | null
          phone?: string | null
          email?: string | null
          chatwoot_contact_id?: number | null
          parent_id?: number | null
          lead_id?: number | null
          student_id?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      automation_queue: {
        Row: {
          id: number
          rule_key: string
          rule_name: string
          dedupe_key: string
          phone: string
          parent_name: string | null
          child_name: string | null
          lead_id: number | null
          student_id: number | null
          message: string
          status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired'
          due_at: string
          expires_at: string | null
          decided_by: string | null
          decided_at: string | null
          sent_at: string | null
          error: string | null
          created_at: string
        }
        Insert: never
        Update: {
          message?: string
          status?: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired'
          decided_by?: string | null
          decided_at?: string | null
          sent_at?: string | null
          error?: string | null
        }
        Relationships: []
      }
      automation_settings: {
        Row: {
          id: boolean
          paused: boolean
          daily_cap: number
          gap_seconds: number
          updated_at: string
        }
        Insert: never
        Update: {
          paused?: boolean
          daily_cap?: number
          gap_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_contacts: {
        Row: {
          id: number
          name: string
          phone: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          phone: string
        }
        Update: {
          name?: string
          phone?: string
        }
        Relationships: []
      }
      automation_flows: {
        Row: {
          id: number
          name: string
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting'
          enabled: boolean
          graph: Json
          last_run_at: string | null
          last_error: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting'
          enabled?: boolean
          graph?: Json
        }
        Update: {
          name?: string
          trigger_type?: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting'
          enabled?: boolean
          graph?: Json
        }
        Relationships: []
      }
      ai_drafts: {
        Row: {
          id: number
          created_at: string
          requested_by: string | null
          chat_id: number
          last_message_id: number
          draft: string | null
          skipped: boolean
          staff_note: string | null
          model: string | null
          latency_ms: number | null
          accepted_at: string | null
          parent_text: string | null
          category: string | null
          sent_text: string | null
          sent_at: string | null
          sent_by: string | null
          gap_resolved_at: string | null
          reviewed_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      ai_knowledge_notes: {
        Row: {
          id: number
          title: string
          body: string
          enabled: boolean
          sort_order: number
          created_by: string | null
          created_at: string
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          title: string
          body?: string
          enabled?: boolean
        }
        Update: {
          title?: string
          body?: string
          enabled?: boolean
        }
        Relationships: []
      }
      ai_knowledge_note_versions: {
        Row: {
          id: number
          note_id: number
          title: string
          body: string
          written_at: string
          written_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      leads: {
        Row: {
          id: number
          full_name: string | null
          phone: string | null
          source: string
          source_id: number | null
          pic_id: number | null
          state: string | null
          tag_ids: number[]
          checks: Record<string, { at: string | null; by: number | null }>
          status:
            | 'new'
            | 'contacted'
            | 'trial_scheduled'
            | 'trial_completed'
            | 'converted'
            | 'lost'
          children: { name: string; age: number; phone: string | null }[]
          notes: string | null
          follow_ups: { date: string; note: string }[]
          tasks: { id: string; title: string; dueDate: string; completed: boolean }[]
          converted_student_id: number | null
          added_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          full_name?: string | null
          phone?: string | null
          source?: string
          source_id?: number | null
          pic_id?: number | null
          state?: string | null
          tag_ids?: number[]
          checks?: Record<string, boolean | { at: string | null; by: number | null }>
          status?:
            | 'new'
            | 'contacted'
            | 'trial_scheduled'
            | 'trial_completed'
            | 'converted'
            | 'lost'
          children?: { name: string; age: number; phone: string | null }[]
          notes?: string | null
          follow_ups?: { date: string; note: string }[]
          tasks?: { id: string; title: string; dueDate: string; completed: boolean }[]
          converted_student_id?: number | null
          added_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          full_name?: string | null
          phone?: string | null
          source?: string
          source_id?: number | null
          pic_id?: number | null
          state?: string | null
          tag_ids?: number[]
          checks?: Record<string, boolean | { at: string | null; by: number | null }>
          status?:
            | 'new'
            | 'contacted'
            | 'trial_scheduled'
            | 'trial_completed'
            | 'converted'
            | 'lost'
          children?: { name: string; age: number; phone: string | null }[]
          notes?: string | null
          follow_ups?: { date: string; note: string }[]
          tasks?: { id: string; title: string; dueDate: string; completed: boolean }[]
          converted_student_id?: number | null
          added_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leads_converted_student_id_fkey'
            columns: ['converted_student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      schedules: {
        Row: {
          id: number
          teacher_id: number
          student_id: number | null
          classroom_id: number | null
          title: string
          event_type: 'regular' | 'replacement'
          recurrence_type: 'weekly' | 'none'
          day_of_week: number | null
          scheduled_date: string | null
          start_time: string
          end_time: string
          start_recur: string | null
          end_recur: string | null
          status: 'active' | 'cancelled'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          teacher_id: number
          student_id?: number | null
          classroom_id?: number | null
          title: string
          event_type: 'regular' | 'replacement'
          recurrence_type?: 'weekly' | 'none'
          day_of_week?: number | null
          scheduled_date?: string | null
          start_time: string
          end_time: string
          start_recur?: string | null
          end_recur?: string | null
          status?: 'active' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          teacher_id?: number
          student_id?: number | null
          classroom_id?: number | null
          title?: string
          event_type?: 'regular' | 'replacement'
          recurrence_type?: 'weekly' | 'none'
          day_of_week?: number | null
          scheduled_date?: string | null
          start_time?: string
          end_time?: string
          start_recur?: string | null
          end_recur?: string | null
          status?: 'active' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedules_classroom_id_fkey'
            columns: ['classroom_id']
            isOneToOne: false
            referencedRelation: 'classrooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'schedules_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'schedules_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      schedule_students: {
        Row: {
          id: number
          schedule_id: number
          student_id: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          schedule_id: number
          student_id: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          schedule_id?: number
          student_id?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_students_schedule_id_fkey'
            columns: ['schedule_id']
            isOneToOne: false
            referencedRelation: 'schedules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'schedule_students_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      makeup_plans: {
        Row: {
          id: number
          classroom_id: number
          missed_date: string
          student_id: number | null
          missed_minutes: number
          notes: string | null
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          classroom_id: number
          missed_date: string
          student_id?: number | null
          missed_minutes: number
          notes?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          classroom_id?: number
          missed_date?: string
          student_id?: number | null
          missed_minutes?: number
          notes?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      makeup_sessions: {
        Row: {
          id: number
          plan_id: number
          session_date: string
          extra_minutes: number
        }
        Insert: {
          id?: number
          plan_id: number
          session_date: string
          extra_minutes: number
        }
        Update: {
          id?: number
          plan_id?: number
          session_date?: string
          extra_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: 'makeup_sessions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'makeup_plans'
            referencedColumns: ['id']
          },
        ]
      }
      schedule_exceptions: {
        Row: {
          id: number
          schedule_id: number
          exception_date: string
          reason: string | null
          moved_to_schedule_id: number | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: number
          schedule_id: number
          exception_date: string
          reason?: string | null
          moved_to_schedule_id?: number | null
          created_by?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          schedule_id?: number
          exception_date?: string
          reason?: string | null
          moved_to_schedule_id?: number | null
          created_by?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_exceptions_schedule_id_fkey'
            columns: ['schedule_id']
            isOneToOne: false
            referencedRelation: 'schedules'
            referencedColumns: ['id']
          },
        ]
      }
      trial_bookings: {
        Row: {
          id: number
          schedule_id: number
          booking_date: string
          lead_id: number | null
          student_id: number | null
          child_name: string
          child_age: number | null
          phone: string | null
          notes: string | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: number
          schedule_id: number
          booking_date: string
          lead_id?: number | null
          student_id?: number | null
          child_name: string
          child_age?: number | null
          phone?: string | null
          notes?: string | null
          created_by?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          schedule_id?: number
          booking_date?: string
          lead_id?: number | null
          student_id?: number | null
          child_name?: string
          child_age?: number | null
          phone?: string | null
          notes?: string | null
          created_by?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'trial_bookings_schedule_id_fkey'
            columns: ['schedule_id']
            isOneToOne: false
            referencedRelation: 'schedules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'trial_bookings_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      lesson_logs: {
        Row: {
          id: number
          schedule_id: number
          teacher_id: number
          lesson_date: string
          lesson_remark: string | null
          submitted_at: string
          revision_number: number
          parent_log_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          schedule_id: number
          teacher_id: number
          lesson_date: string
          lesson_remark?: string | null
          submitted_at?: string
          revision_number?: number
          parent_log_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          schedule_id?: number
          teacher_id?: number
          lesson_date?: string
          lesson_remark?: string | null
          submitted_at?: string
          revision_number?: number
          parent_log_id?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_logs_parent_log_id_fkey'
            columns: ['parent_log_id']
            isOneToOne: false
            referencedRelation: 'lesson_logs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_logs_schedule_id_fkey'
            columns: ['schedule_id']
            isOneToOne: false
            referencedRelation: 'schedules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_logs_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      lesson_log_students: {
        Row: {
          id: number
          lesson_log_id: number
          student_id: number
          attendance_status: 'present' | 'absent' | 'leave'
          created_at: string
        }
        Insert: {
          id?: number
          lesson_log_id: number
          student_id: number
          attendance_status: 'present' | 'absent' | 'leave'
          created_at?: string
        }
        Update: {
          id?: number
          lesson_log_id?: number
          student_id?: number
          attendance_status?: 'present' | 'absent' | 'leave'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_log_students_lesson_log_id_fkey'
            columns: ['lesson_log_id']
            isOneToOne: false
            referencedRelation: 'lesson_logs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_log_students_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      lesson_log_student_reviews: {
        Row: {
          id: number
          lesson_log_id: number
          student_id: number
          logical_thinking_score: number | null
          logical_thinking_remark: string | null
          coding_creativity_score: number | null
          coding_creativity_remark: string | null
          problem_solving_score: number | null
          problem_solving_remark: string | null
          expressiveness_score: number | null
          expressiveness_remark: string | null
          sustained_focus_score: number | null
          sustained_focus_remark: string | null
          lesson_remark: string | null
          created_at: string
        }
        Insert: {
          id?: number
          lesson_log_id: number
          student_id: number
          logical_thinking_score?: number | null
          logical_thinking_remark?: string | null
          coding_creativity_score?: number | null
          coding_creativity_remark?: string | null
          problem_solving_score?: number | null
          problem_solving_remark?: string | null
          expressiveness_score?: number | null
          expressiveness_remark?: string | null
          sustained_focus_score?: number | null
          sustained_focus_remark?: string | null
          lesson_remark?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          lesson_log_id?: number
          student_id?: number
          logical_thinking_score?: number | null
          logical_thinking_remark?: string | null
          coding_creativity_score?: number | null
          coding_creativity_remark?: string | null
          problem_solving_score?: number | null
          problem_solving_remark?: string | null
          expressiveness_score?: number | null
          expressiveness_remark?: string | null
          sustained_focus_score?: number | null
          sustained_focus_remark?: string | null
          lesson_remark?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_log_student_reviews_lesson_log_id_fkey'
            columns: ['lesson_log_id']
            isOneToOne: false
            referencedRelation: 'lesson_logs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lesson_log_student_reviews_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      student_lesson_ledger: {
        Row: {
          id: number
          student_id: number
          lesson_log_id: number
          delta_lessons: number
          reason: string
          created_at: string
        }
        Insert: {
          id?: number
          student_id: number
          lesson_log_id: number
          delta_lessons: number
          reason: string
          created_at?: string
        }
        Update: {
          id?: number
          student_id?: number
          lesson_log_id?: number
          delta_lessons?: number
          reason?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_lesson_ledger_lesson_log_id_fkey'
            columns: ['lesson_log_id']
            isOneToOne: false
            referencedRelation: 'lesson_logs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_lesson_ledger_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      student_admin_ledger: {
        Row: {
          id: number
          student_id: number
          action_type:
            | 'student_created'
            | 'hours_added'
            | 'lesson_expiry_updated'
            | 'account_fee_expiry_updated'
            | 'mirai_club_expiry_updated'
          delta_hours: number | null
          old_date: string | null
          new_date: string | null
          remark: string | null
          actor_teacher_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          student_id: number
          action_type:
            | 'student_created'
            | 'hours_added'
            | 'lesson_expiry_updated'
            | 'account_fee_expiry_updated'
            | 'mirai_club_expiry_updated'
          delta_hours?: number | null
          old_date?: string | null
          new_date?: string | null
          remark?: string | null
          actor_teacher_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          student_id?: number
          action_type?:
            | 'student_created'
            | 'hours_added'
            | 'lesson_expiry_updated'
            | 'account_fee_expiry_updated'
            | 'mirai_club_expiry_updated'
          delta_hours?: number | null
          old_date?: string | null
          new_date?: string | null
          remark?: string | null
          actor_teacher_id?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_admin_ledger_actor_teacher_id_fkey'
            columns: ['actor_teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_admin_ledger_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
        ]
      }
      forms: {
        Row: {
          id: string
          name: string
          fields: Json
          settings: Json
          is_published: boolean
          slug: string | null
          view_count: number
          created_at: string
          updated_at: string
          updated_by_teacher_id: number | null
        }
        Insert: {
          id?: string
          name: string
          fields?: Json
          settings?: Json
          is_published?: boolean
          slug?: string | null
          view_count?: number
          created_at?: string
          updated_at?: string
          updated_by_teacher_id?: number | null
        }
        Update: {
          id?: string
          name?: string
          fields?: Json
          settings?: Json
          is_published?: boolean
          slug?: string | null
          view_count?: number
          created_at?: string
          updated_at?: string
          updated_by_teacher_id?: number | null
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          id: number
          form_id: string
          answers: Json
          lead_id: number | null
          lead_was_existing: boolean
          status: string
          session_token: string | null
          last_page: number | null
          tracking: Json | null
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: number
          form_id: string
          answers?: Json
          lead_id?: number | null
          lead_was_existing?: boolean
          status?: string
          session_token?: string | null
          last_page?: number | null
          tracking?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          form_id?: string
          answers?: Json
          lead_id?: number | null
          lead_was_existing?: boolean
          status?: string
          session_token?: string | null
          last_page?: number | null
          tracking?: Json | null
          notified_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      run_automation_rules: {
        Args: Record<string, never>
        Returns: number
      }
      chat_webhook_info: {
        Args: Record<PropertyKey, never>
        Returns: {
          webhook_key: string
          last_received_at: string | null
          chats: number
        }[]
      }
      queue_automation_test: {
        Args: {
          p_flow_id: number
          p_phone: string
          p_age?: number | null
          p_classroom_id?: number | null
        }
        Returns: number
      }
      reorder_ai_knowledge_notes: {
        Args: {
          p_ids: number[]
        }
        Returns: undefined
      }
      mark_ai_draft_accepted: {
        Args: {
          p_id: number
        }
        Returns: undefined
      }
      record_ai_draft_sent: {
        Args: {
          p_id: number
          p_text: string
        }
        Returns: undefined
      }
      resolve_ai_gap: {
        Args: {
          p_note: string
        }
        Returns: number
      }
      review_ai_example: {
        Args: {
          p_id: number
        }
        Returns: undefined
      }
      ensure_contact_people: {
        Args: {
          p_contacts: Json
        }
        Returns: number
      }
      link_contact_to_lead: {
        Args: {
          p_contact_id: number
          p_lead_id: number
        }
        Returns: undefined
      }
      link_contact_to_students: {
        Args: {
          p_contact_id: number
          p_student_ids: number[]
        }
        Returns: undefined
      }
      set_contact_role: {
        Args: {
          p_contact_id: number
          p_role: string
        }
        Returns: undefined
      }
      set_late_feedback_edit: {
        Args: {
          p_open: boolean
        }
        Returns: undefined
      }
      set_student_class_start: {
        Args: {
          p_student_id: number
          p_start_date: string | null
        }
        Returns: undefined
      }
      change_student_package: {
        Args: {
          p_student_id: number
          p_package_id: number
          p_start_date: string
          p_class_count: number
          p_lesson_expiry_date: string
          p_account_fee_expiry_date: string
          p_mirai_club_expiry_date: string
          p_remark?: string | null
        }
        Returns: number
      }
      enroll_student_package: {
        Args: {
          p_student_id: number
          p_package_id: number
          p_start_date: string
          p_class_count: number
          p_lesson_expiry_date: string
          p_account_fee_expiry_date: string | null
          p_mirai_club_expiry_date: string | null
          p_remark?: string | null
        }
        Returns: number
      }
      set_student_package: {
        Args: {
          p_student_id: number
          p_package_id: number | null
        }
        Returns: undefined
      }
      set_account_permissions: {
        Args: {
          p_teacher_id: number
          p_permissions: Json
        }
        Returns: undefined
      }
      book_trial_slot: {
        Args: {
          p_schedule_id: number
          p_booking_date: string
          p_child_name: string
          p_child_age?: number | null
          p_phone?: string | null
          p_lead_id?: number | null
          p_notes?: string | null
        }
        Returns: number
      }
      cancel_trial_booking: {
        Args: {
          p_booking_id: number
        }
        Returns: undefined
      }
      cancel_schedule_occurrence: {
        Args: {
          p_schedule_id: number
          p_occurrence_date: string
          p_reason?: string | null
        }
        Returns: number | null
      }
      restore_schedule_occurrence: {
        Args: {
          p_schedule_id: number
          p_occurrence_date: string
        }
        Returns: undefined
      }
      move_class_occurrence: {
        Args: {
          p_schedule_id: number
          p_from_date: string
          p_to_date: string
          p_start_time: string
          p_end_time: string
          p_reason?: string | null
        }
        Returns: number
      }
      reschedule_trial_bookings: {
        Args: {
          p_from_schedule_id: number
          p_from_date: string
          p_to_date: string
          p_start_time: string
          p_end_time: string
        }
        Returns: number
      }
      move_trial_bookings: {
        Args: {
          p_from_schedule_id: number
          p_from_date: string
          p_to_schedule_id: number
          p_to_date: string
        }
        Returns: number
      }
      create_student_record: {
        Args: {
          p_full_name: string
          p_phone?: string | null
          p_teacher_id: number | null
          p_initial_hours: number
          p_lesson_expiry_date: string
          p_account_fee_expiry_date: string
          p_mirai_club_expiry_date: string
          p_notes: string | null
          p_student_type?: 'trial' | 'preview' | 'regular'
          p_classroom_id?: number | null
          p_lead_id?: number | null
        }
        Returns: {
          student_id: number
        }[]
      }
      delete_teacher_account: {
        Args: {
          p_teacher_id: number
          p_successor_teacher_id?: number | null
        }
        Returns: boolean
      }
      save_makeup_plan: {
        Args: {
          p_plan_id: number | null
          p_classroom_id: number
          p_missed_date: string
          p_student_id: number | null
          p_missed_minutes: number
          p_notes: string | null
          p_sessions: { session_date: string; extra_minutes: number }[]
        }
        Returns: number
      }
      delete_makeup_plan: {
        Args: {
          p_plan_id: number
        }
        Returns: undefined
      }
      reassign_classroom_teacher: {
        Args: {
          p_classroom_id: number
          p_new_teacher_id: number
          p_effective_date?: string | null
        }
        Returns: undefined
      }
      create_preview_student_records: {
        Args: {
          p_students: {
            full_name: string
            phone: string
          }[]
        }
        Returns: {
          student_id: number
        }[]
      }
      create_teacher_record: {
        Args: {
          p_username: string
          p_full_name: string
          p_email: string | null
          p_phone: string | null
          p_role?: string
        }
        Returns: {
          teacher_id: number
        }[]
      }
      record_admin_activity: {
        Args: {
          p_action_type: string
          p_entity_type: 'student' | 'teacher' | 'classroom' | 'schedule' | 'lead'
          p_entity_id: number | null
          p_entity_label: string
          p_details?: Json
        }
        Returns: number
      }
      update_student_record: {
        Args: {
          p_student_id: number
          p_full_name: string
          p_phone?: string | null
          p_teacher_id: number | null
          p_classroom_id: number | null
          p_notes: string | null
          p_student_type?: 'trial' | 'preview' | 'regular'
        }
        Returns: undefined
      }
      update_teacher_record: {
        Args: {
          p_teacher_id: number
          p_username: string
          p_full_name: string
          p_email: string | null
          p_phone: string | null
          p_role: string
        }
        Returns: undefined
      }
      archive_classroom: {
        Args: {
          p_classroom_id: number
        }
        Returns: undefined
      }
      restore_classroom: {
        Args: {
          p_classroom_id: number
        }
        Returns: undefined
      }
      renew_student_record: {
        Args: {
          p_student_id: number
          p_add_hours: number
          p_new_lesson_expiry_date: string | null
          p_new_account_fee_expiry_date: string | null
          p_new_mirai_club_expiry_date: string | null
          p_remark: string | null
        }
        Returns: {
          student_id: number
          remaining_hours: number
        }[]
      }
      submit_lesson_attendance: {
        Args: {
          p_schedule_id: number
          p_occurrence_date: string
          p_lesson_remark: string | null
          p_attendance: {
            student_id: number
            status: 'present' | 'absent' | 'leave'
          }[]
          p_student_reviews: {
            student_id: number
            logicalThinkingScore: number
            logicalThinkingRemark: string | null
            codingCreativityScore: number
            codingCreativityRemark: string | null
            problemSolvingScore: number
            problemSolvingRemark: string | null
            expressivenessScore: number
            expressivenessRemark: string | null
            sustainedFocusScore: number
            sustainedFocusRemark: string | null
            lessonRemark?: string | null
          }[]
        }
        Returns: {
          lesson_log_id: number
          revision_number: number
          updated_student_count: number
        }[]
      }
      bulk_set_lead_tag: {
        Args: {
          p_lead_ids: number[]
          p_tag_id: number
          p_add: boolean
        }
        Returns: number
      }
      set_lead_check: {
        Args: {
          p_lead_id: number
          p_slot: number
          p_checked: boolean
        }
        Returns: boolean
      }
      get_public_form: {
        Args: {
          p_form_id: string
        }
        Returns: Json | null
      }
      get_public_form_by_key: {
        Args: {
          p_form_key: string
        }
        Returns: Json | null
      }
      record_form_view: {
        Args: {
          p_form_id: string
        }
        Returns: undefined
      }
      save_form_progress: {
        Args: {
          p_form_id: string
          p_token: string
          p_answers: Json
          p_last_page?: number
        }
        Returns: undefined
      }
      submit_form: {
        Args: {
          p_form_id: string
          p_answers: Json
          p_honeypot?: string
          p_token?: string | null
          p_tracking?: Json | null
        }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
