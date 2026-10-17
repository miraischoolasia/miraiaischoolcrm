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
          age_group: string
          program_level: string
          teacher_id: number | null
          status: 'active' | 'archived'
          notes: string | null
          archived_at: string | null
          zoom_link: string | null
          programme_id: number | null
          subject_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          category?: 'regular' | 'trial' | 'camp'
          id?: number
          name: string
          age_group: string
          program_level: string
          teacher_id?: number | null
          status?: 'active' | 'archived'
          notes?: string | null
          archived_at?: string | null
          zoom_link?: string | null
          programme_id?: number | null
          subject_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category?: 'regular' | 'trial' | 'camp'
          id?: number
          name?: string
          age_group?: string
          program_level?: string
          teacher_id?: number | null
          status?: 'active' | 'archived'
          notes?: string | null
          archived_at?: string | null
          zoom_link?: string | null
          programme_id?: number | null
          subject_id?: number | null
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
          date_of_birth: string | null
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
          date_of_birth?: string | null
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
          date_of_birth?: string | null
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
      calendar_items: {
        Row: {
          id: number
          kind: 'task' | 'meeting' | 'event'
          title: string
          notes: string | null
          item_date: string
          start_time: string | null
          end_time: string | null
          zoom_link: string | null
          assignee_id: number | null
          lead_id: number | null
          is_done: boolean
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          kind: 'task' | 'meeting' | 'event'
          title: string
          notes?: string | null
          item_date: string
          start_time?: string | null
          end_time?: string | null
          zoom_link?: string | null
          assignee_id?: number | null
          lead_id?: number | null
          is_done?: boolean
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          kind?: 'task' | 'meeting' | 'event'
          title?: string
          notes?: string | null
          item_date?: string
          start_time?: string | null
          end_time?: string | null
          zoom_link?: string | null
          assignee_id?: number | null
          lead_id?: number | null
          is_done?: boolean
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_avatars: {
        Row: {
          channel_key: string
          avatar: string
          updated_at: string
        }
        Insert: {
          channel_key: string
          avatar: string
          updated_at?: string
        }
        Update: {
          channel_key?: string
          avatar?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_channels: {
        Row: {
          id: number
          lead_id: number
          channel: 'whatsapp' | 'messenger' | 'instagram'
          chatwoot_contact_id: number
          inbox_id: number
          inbox_name: string | null
          conversation_id: number | null
          display_name: string | null
          page_name: string | null
          first_seen_at: string
          created_at: string
        }
        Insert: {
          id?: number
          lead_id: number
          channel: 'whatsapp' | 'messenger' | 'instagram'
          chatwoot_contact_id: number
          inbox_id?: number
          inbox_name?: string | null
          conversation_id?: number | null
          display_name?: string | null
          page_name?: string | null
          first_seen_at?: string
          created_at?: string
        }
        Update: {
          id?: number
          lead_id?: number
          channel?: 'whatsapp' | 'messenger' | 'instagram'
          chatwoot_contact_id?: number
          inbox_id?: number
          inbox_name?: string | null
          conversation_id?: number | null
          display_name?: string | null
          page_name?: string | null
          first_seen_at?: string
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_numbers: {
        Row: {
          id: number
          label: string
          phone: string | null
          chatwoot_inbox_id: number
          evolution_instance: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          label: string
          phone?: string | null
          chatwoot_inbox_id: number
          evolution_instance?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          label?: string
          phone?: string | null
          chatwoot_inbox_id?: number
          evolution_instance?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_number_staff: {
        Row: {
          number_id: number
          teacher_id: number
        }
        Insert: {
          number_id: number
          teacher_id: number
        }
        Update: {
          number_id?: number
          teacher_id?: number
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
      programmes: {
        Row: {
          id: number
          name: string
          legacy_key: 'hoa' | 'camp' | null
          outcome: 'booking' | 'enrol'
          message_template: string
          is_active: boolean
          sort_order: number
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          legacy_key?: 'hoa' | 'camp' | null
          outcome?: 'booking' | 'enrol'
          message_template?: string
          is_active?: boolean
          sort_order?: number
          category?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          legacy_key?: 'hoa' | 'camp' | null
          outcome?: 'booking' | 'enrol'
          message_template?: string
          is_active?: boolean
          sort_order?: number
          category?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      programme_steps: {
        Row: {
          id: number
          programme_id: number
          sort_order: number
          kind: 'form' | 'class' | 'receipt' | 'zoom' | 'custom'
          title: string
          created_at: string
        }
        Insert: {
          id?: number
          programme_id: number
          sort_order?: number
          kind: 'form' | 'class' | 'receipt' | 'zoom' | 'custom'
          title: string
          created_at?: string
        }
        Update: {
          id?: number
          programme_id?: number
          sort_order?: number
          kind?: 'form' | 'class' | 'receipt' | 'zoom' | 'custom'
          title?: string
          created_at?: string
        }
        Relationships: []
      }
      lead_programme_steps: {
        Row: {
          id: number
          lead_id: number
          step_id: number
          done: boolean
          note: string | null
          step_date: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          lead_id: number
          step_id: number
          done?: boolean
          note?: string | null
          step_date?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          lead_id?: number
          step_id?: number
          done?: boolean
          note?: string | null
          step_date?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_stages: {
        Row: {
          key: string
          label: string
          color: string
          sort_order: number
          is_active: boolean
          is_system: boolean
          created_at: string
        }
        Insert: {
          key?: string
          label: string
          color?: string
          sort_order?: number
          is_active?: boolean
          is_system?: boolean
          created_at?: string
        }
        Update: {
          key?: string
          label?: string
          color?: string
          sort_order?: number
          is_active?: boolean
          is_system?: boolean
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
          // Empty for a Messenger / Instagram chat, which is named by conversation_id instead.
          phone: string | null
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
          sent_by_automation: boolean
          auto_blocked: string | null
          media_url: string | null
          conversation_id: number | null
          contact_id: number | null
          channel: 'whatsapp' | 'messenger' | 'instagram'
          kind: 'message' | 'ghl_workflow'
          workflow_id: string | null
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
      automation_flow_log: {
        Row: {
          id: number
          flow_id: number
          event_key: string
          node_id: string
          kind:
            | 'stage_stopped'
            | 'cooldown'
            | 'condition_no'
            | 'no_message'
            | 'no_phone'
            | 'opted_out'
            | 'replied'
            | 'no_reply'
            | 'reply_branch'
            | 'action_done'
            | 'action_skipped'
            | 'channel_off'
            | 'keyword_matched'
          detail: string | null
          phone: string | null
          parent_name: string | null
          child_name: string | null
          lead_id: number | null
          student_id: number | null
          starts_at: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      automation_settings: {
        Row: {
          id: boolean
          paused: boolean
          daily_cap: number
          gap_seconds: number
          send_from_hour: number
          send_until_hour: number
          sender_seen_at: string | null
          updated_at: string
        }
        Insert: never
        Update: {
          paused?: boolean
          daily_cap?: number
          gap_seconds?: number
          send_from_hour?: number
          send_until_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_optouts: {
        Row: {
          phone: string
          reason: string | null
          created_at: string
        }
        Insert: {
          phone: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          phone?: string
          reason?: string | null
          created_at?: string
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
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword'
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
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword'
          enabled?: boolean
          graph?: Json
        }
        Update: {
          name?: string
          trigger_type?: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword'
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
          missing_info: string | null
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
          source_rule_id: number | null
          state: string | null
          tag_ids: number[]
          checks: Record<string, { at: string | null; by: number | null }>
          status: string
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
          source_rule_id?: number | null
          state?: string | null
          tag_ids?: number[]
          checks?: Record<string, boolean | { at: string | null; by: number | null }>
          status?: string
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
          source_rule_id?: number | null
          state?: string | null
          tag_ids?: number[]
          checks?: Record<string, boolean | { at: string | null; by: number | null }>
          status?: string
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
          attendance_status: string
          created_at: string
        }
        Insert: {
          id?: number
          lesson_log_id: number
          student_id: number
          attendance_status: string
          created_at?: string
        }
        Update: {
          id?: number
          lesson_log_id?: number
          student_id?: number
          attendance_status?: string
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
      attendance_statuses: {
        Row: {
          key: string
          label: string
          attended: boolean
          deducts_lesson: boolean
          color: 'emerald' | 'slate' | 'amber' | 'sky' | 'rose' | 'violet'
          sort_order: number
          is_active: boolean
          reward_points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          key: string
          label: string
          attended: boolean
          deducts_lesson: boolean
          color?: 'emerald' | 'slate' | 'amber' | 'sky' | 'rose' | 'violet'
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          key?: string
          label?: string
          attended?: boolean
          deducts_lesson?: boolean
          color?: 'emerald' | 'slate' | 'amber' | 'sky' | 'rose' | 'violet'
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_presets: {
        Row: {
          id: number
          label: string
          points: number
          emoji: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          label: string
          points: number
          emoji?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          label?: string
          points?: number
          emoji?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_levels: {
        Row: {
          id: number
          name: string
          min_points: number
          created_at: string
        }
        Insert: {
          id?: never
          name: string
          min_points: number
          created_at?: string
        }
        Update: {
          id?: never
          name?: string
          min_points?: number
          created_at?: string
        }
        Relationships: []
      }
      student_points: {
        Row: {
          id: number
          student_id: number
          points: number
          kind: 'attendance' | 'award' | 'redeem' | 'adjust' | 'question'
          reason: string
          schedule_id: number | null
          lesson_date: string | null
          preset_id: number | null
          reverses_id: number | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: never
          student_id: number
          points: number
          kind: 'attendance' | 'award' | 'redeem' | 'adjust' | 'question'
          reason: string
          schedule_id?: number | null
          lesson_date?: string | null
          preset_id?: number | null
          reverses_id?: number | null
          created_by?: number | null
          created_at?: string
        }
        Update: {
          id?: never
          student_id?: number
          points?: number
          kind?: 'attendance' | 'award' | 'redeem' | 'adjust' | 'question'
          reason?: string
          schedule_id?: number | null
          lesson_date?: string | null
          preset_id?: number | null
          reverses_id?: number | null
          created_by?: number | null
          created_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: number
          owner_id: number
          is_shared: boolean
          kind: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt: string
          options: Json
          accepted_answers: Json
          case_sensitive: boolean
          points: number
          time_limit_seconds: number
          topic: string | null
          explanation: string | null
          is_archived: boolean
          created_at: string
          updated_at: string
          subject_id: number | null
          age_groups: string[]
        }
        Insert: {
          id?: never
          owner_id: number
          is_shared?: boolean
          kind: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt: string
          options?: Json
          accepted_answers?: Json
          case_sensitive?: boolean
          points?: number
          time_limit_seconds?: number
          topic?: string | null
          explanation?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
          subject_id?: number | null
          age_groups?: string[]
        }
        Update: {
          id?: never
          owner_id?: number
          is_shared?: boolean
          kind?: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt?: string
          options?: Json
          accepted_answers?: Json
          case_sensitive?: boolean
          points?: number
          time_limit_seconds?: number
          topic?: string | null
          explanation?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_sessions: {
        Row: {
          id: number
          schedule_id: number
          lesson_date: string
          classroom_id: number | null
          teacher_id: number
          starts_at: string
          ends_at: string
          status: 'scheduled' | 'live' | 'ended'
          started_at: string | null
          ended_at: string | null
          recording_url: string | null
          lesson_log_id: number | null
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          schedule_id: number
          lesson_date: string
          classroom_id?: number | null
          teacher_id: number
          starts_at: string
          ends_at: string
          status?: 'scheduled' | 'live' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          recording_url?: string | null
          lesson_log_id?: number | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          schedule_id?: number
          lesson_date?: string
          classroom_id?: number | null
          teacher_id?: number
          starts_at?: string
          ends_at?: string
          status?: 'scheduled' | 'live' | 'ended'
          started_at?: string | null
          ended_at?: string | null
          recording_url?: string | null
          lesson_log_id?: number | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_questions: {
        Row: {
          id: number
          session_id: number
          question_id: number | null
          position: number
          kind: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt: string
          options: Json
          points: number
          time_limit_seconds: number
          scoring: 'speed' | 'fixed'
          status: 'live' | 'closed'
          opened_at: string
          closes_at: string
          closed_at: string | null
          revealed_at: string | null
          created_by: number | null
        }
        Insert: {
          id?: never
          session_id: number
          question_id?: number | null
          position: number
          kind: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt: string
          options?: Json
          points: number
          time_limit_seconds: number
          scoring: 'speed' | 'fixed'
          status?: 'live' | 'closed'
          opened_at?: string
          closes_at: string
          closed_at?: string | null
          revealed_at?: string | null
          created_by?: number | null
        }
        Update: {
          id?: never
          session_id?: number
          question_id?: number | null
          position?: number
          kind?: 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
          prompt?: string
          options?: Json
          points?: number
          time_limit_seconds?: number
          scoring?: 'speed' | 'fixed'
          status?: 'live' | 'closed'
          opened_at?: string
          closes_at?: string
          closed_at?: string | null
          revealed_at?: string | null
          created_by?: number | null
        }
        Relationships: []
      }
      live_question_keys: {
        Row: {
          live_question_id: number
          correct_options: number[]
          accepted_answers: Json
          case_sensitive: boolean
          explanation: string | null
        }
        Insert: {
          live_question_id: number
          correct_options?: number[]
          accepted_answers?: Json
          case_sensitive?: boolean
          explanation?: string | null
        }
        Update: {
          live_question_id?: number
          correct_options?: number[]
          accepted_answers?: Json
          case_sensitive?: boolean
          explanation?: string | null
        }
        Relationships: []
      }
      live_answers: {
        Row: {
          id: number
          live_question_id: number
          session_id: number
          student_id: number
          answered_by: 'student' | 'parent'
          answer_text: string | null
          answer_choices: number[] | null
          file_path: string | null
          submitted_at: string
          seconds_taken: number
          points_if_correct: number
          result: 'correct' | 'wrong' | 'pending'
          points: number
          marked_by: 'auto' | 'teacher' | null
          marked_at: string | null
          ai_suggestion: 'right' | 'wrong' | 'unsure' | null
          ai_feedback: string | null
          ai_note: string | null
          ai_checked_at: string | null
          feedback: string | null
          points_entry_id: number | null
        }
        Insert: {
          id?: never
          live_question_id: number
          session_id: number
          student_id: number
          answered_by: 'student' | 'parent'
          answer_text?: string | null
          answer_choices?: number[] | null
          file_path?: string | null
          submitted_at?: string
          seconds_taken: number
          points_if_correct: number
          result: 'correct' | 'wrong' | 'pending'
          points?: number
          marked_by?: 'auto' | 'teacher' | null
          marked_at?: string | null
          ai_suggestion?: 'right' | 'wrong' | 'unsure' | null
          ai_feedback?: string | null
          ai_note?: string | null
          ai_checked_at?: string | null
          feedback?: string | null
          points_entry_id?: number | null
        }
        Update: {
          id?: never
          live_question_id?: number
          session_id?: number
          student_id?: number
          answered_by?: 'student' | 'parent'
          answer_text?: string | null
          answer_choices?: number[] | null
          file_path?: string | null
          submitted_at?: string
          seconds_taken?: number
          points_if_correct?: number
          result?: 'correct' | 'wrong' | 'pending'
          points?: number
          marked_by?: 'auto' | 'teacher' | null
          marked_at?: string | null
          ai_suggestion?: 'right' | 'wrong' | 'unsure' | null
          ai_feedback?: string | null
          ai_note?: string | null
          ai_checked_at?: string | null
          feedback?: string | null
          points_entry_id?: number | null
        }
        Relationships: []
      }
      class_session_zoom: {
        Row: {
          session_id: number
          meeting_id: string
          join_url: string | null
          passcode: string | null
          uses_registration: boolean
          topic: string | null
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          session_id: number
          meeting_id: string
          join_url?: string | null
          passcode?: string | null
          uses_registration?: boolean
          topic?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          session_id?: number
          meeting_id?: string
          join_url?: string | null
          passcode?: string | null
          uses_registration?: boolean
          topic?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_session_zoom_links: {
        Row: {
          session_id: number
          student_id: number
          registrant_id: string | null
          join_url: string
          created_at: string
        }
        Insert: {
          session_id: number
          student_id: number
          registrant_id?: string | null
          join_url: string
          created_at?: string
        }
        Update: {
          session_id?: number
          student_id?: number
          registrant_id?: string | null
          join_url?: string
          created_at?: string
        }
        Relationships: []
      }
      zoom_participation: {
        Row: {
          id: number
          session_id: number
          student_id: number | null
          participant_uuid: string
          user_name: string | null
          joined_at: string
          left_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          session_id: number
          student_id?: number | null
          participant_uuid: string
          user_name?: string | null
          joined_at: string
          left_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          student_id?: number | null
          participant_uuid?: string
          user_name?: string | null
          joined_at?: string
          left_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      class_session_recordings: {
        Row: {
          id: number
          session_id: number
          zoom_recording_uuid: string
          share_url: string | null
          passcode: string | null
          started_at: string | null
          duration_minutes: number | null
          created_at: string
        }
        Insert: {
          id?: never
          session_id: number
          zoom_recording_uuid: string
          share_url?: string | null
          passcode?: string | null
          started_at?: string | null
          duration_minutes?: number | null
          created_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          zoom_recording_uuid?: string
          share_url?: string | null
          passcode?: string | null
          started_at?: string | null
          duration_minutes?: number | null
          created_at?: string
        }
        Relationships: []
      }
      student_ai_reports: {
        Row: {
          id: number
          student_id: number
          audience: 'teacher' | 'parent'
          report: Json
          language: string
          sources: Json
          lesson_count: number
          model: string | null
          created_by: number | null
          created_at: string
          shared_at: string | null
          shared_by: number | null
        }
        Insert: {
          id?: never
          student_id: number
          audience: 'teacher' | 'parent'
          report: Json
          language: string
          sources?: Json
          lesson_count?: number
          model?: string | null
          created_by?: number | null
          created_at?: string
          shared_at?: string | null
          shared_by?: number | null
        }
        Update: {
          id?: never
          student_id?: number
          audience?: 'teacher' | 'parent'
          report?: Json
          language?: string
          sources?: Json
          lesson_count?: number
          model?: string | null
          created_by?: number | null
          created_at?: string
          shared_at?: string | null
          shared_by?: number | null
        }
        Relationships: []
      }
      portal_terms_acceptances: {
        Row: {
          id: number
          auth_user_id: string
          version: number
          text_shown: string
          accepted_at: string
        }
        Insert: {
          id?: never
          auth_user_id: string
          version: number
          text_shown: string
          accepted_at?: string
        }
        Update: {
          id?: never
          auth_user_id?: string
          version?: number
          text_shown?: string
          accepted_at?: string
        }
        Relationships: []
      }
      student_consents: {
        Row: {
          id: number
          student_id: number
          kind: 'ai_analysis' | 'class_recording'
          granted: boolean
          text_shown: string
          given_by_person_id: number | null
          given_by_auth_user: string | null
          created_at: string
        }
        Insert: {
          id?: never
          student_id: number
          kind: 'ai_analysis' | 'class_recording'
          granted: boolean
          text_shown: string
          given_by_person_id?: number | null
          given_by_auth_user?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          student_id?: number
          kind?: 'ai_analysis' | 'class_recording'
          granted?: boolean
          text_shown?: string
          given_by_person_id?: number | null
          given_by_auth_user?: string | null
          created_at?: string
        }
        Relationships: []
      }
      age_groups: {
        Row: {
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_levels: {
        Row: {
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_accounts: {
        Row: {
          auth_user_id: string
          username: string
          kind: 'student' | 'parent'
          student_id: number | null
          parent_person_id: number | null
          is_active: boolean
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          username: string
          kind: 'student' | 'parent'
          student_id?: number | null
          parent_person_id?: number | null
          is_active?: boolean
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          username?: string
          kind?: 'student' | 'parent'
          student_id?: number | null
          parent_person_id?: number | null
          is_active?: boolean
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          id: number
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          name?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_criteria: {
        Row: {
          id: number
          name: string
          description: string | null
          max_score: number
          remark_required_at_or_below: number
          sort_order: number
          is_active: boolean
          legacy_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          name: string
          description?: string | null
          max_score?: number
          remark_required_at_or_below?: number
          sort_order?: number
          is_active?: boolean
          legacy_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          name?: string
          description?: string | null
          max_score?: number
          remark_required_at_or_below?: number
          sort_order?: number
          is_active?: boolean
          legacy_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_review_scores: {
        Row: {
          id: number
          lesson_log_id: number
          student_id: number
          criterion_id: number
          score: number
          remark: string | null
          created_at: string
        }
        Insert: {
          id?: never
          lesson_log_id: number
          student_id: number
          criterion_id: number
          score: number
          remark?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          lesson_log_id?: number
          student_id?: number
          criterion_id?: number
          score?: number
          remark?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lesson_review_scores_criterion_id_fkey'
            columns: ['criterion_id']
            isOneToOne: false
            referencedRelation: 'review_criteria'
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
      my_whatsapp_inbox_ids: {
        Args: Record<PropertyKey, never>
        Returns: number[] | null
      }
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
          p_hours?: number | null
          p_stage?: string | null
          p_source?: number | null
          p_pic?: number | null
          p_tag?: number | null
          p_form?: string | null
          p_keyword?: number | null
        }
        Returns: number
      }
      automation_flow_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          flow_id: number
          queued: number
          sent: number
          pending: number
          skipped: number
          expired: number
          failed: number
          replied: number
        }[]
      }
      reorder_lead_stages: {
        Args: {
          p_keys: string[]
        }
        Returns: undefined
      }
      reorder_programmes: {
        Args: {
          p_ids: number[]
        }
        Returns: undefined
      }
      reorder_programme_steps: {
        Args: {
          p_programme_id: number
          p_ids: number[]
        }
        Returns: undefined
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
      ensure_lead_channels: {
        Args: {
          p_rows: Json
        }
        Returns: Json
      }
      merge_leads: {
        Args: {
          p_keep: number
          p_remove: number
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
      save_attendance_status: {
        Args: {
          p_key: string | null
          p_label: string | null
          p_attended: boolean | null
          p_deducts_lesson: boolean | null
          p_color: string | null
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['attendance_statuses']['Row']
      }
      award_points: {
        Args: {
          p_student_ids: number[]
          p_points: number | null
          p_reason: string | null
          p_preset_id: number | null
          p_schedule_id: number | null
          p_lesson_date: string | null
        }
        Returns: number
      }
      redeem_points: {
        Args: {
          p_student_id: number
          p_points: number
          p_reason: string
        }
        Returns: number
      }
      undo_points: {
        Args: {
          p_points_id: number
        }
        Returns: number
      }
      save_reward_preset: {
        Args: {
          p_id: number | null
          p_label: string
          p_points: number | null
          p_emoji: string | null
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['reward_presets']['Row']
      }
      set_reward_levels: {
        Args: {
          p_levels: Json
        }
        Returns: undefined
      }
      set_attendance_status_points: {
        Args: {
          p_key: string
          p_points: number
        }
        Returns: undefined
      }
      save_question: {
        Args: {
          p_id: number | null
          p_question: Json
        }
        Returns: Database['public']['Tables']['questions']['Row']
      }
      import_questions: {
        Args: {
          p_questions: Json
          p_share: boolean
        }
        Returns: number
      }
      set_question_archived: {
        Args: {
          p_id: number
          p_archived: boolean
        }
        Returns: undefined
      }
      copy_question: {
        Args: {
          p_id: number
        }
        Returns: Database['public']['Tables']['questions']['Row']
      }
      set_ai_report_settings: {
        Args: {
          p_settings: Json
        }
        Returns: undefined
      }
      save_age_group: {
        Args: {
          p_name: string | null
          p_new_name: string
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['age_groups']['Row']
      }
      save_program_level: {
        Args: {
          p_name: string | null
          p_new_name: string
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['program_levels']['Row']
      }
      set_portal_settings: {
        Args: {
          p_settings: Json
        }
        Returns: undefined
      }
      portal_branding: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      portal_children: {
        Args: Record<PropertyKey, never>
        Returns: { student_id: number; full_name: string }[]
      }
      open_class_session: {
        Args: {
          p_schedule_id: number
          p_lesson_date: string
        }
        Returns: Database['public']['Tables']['class_sessions']['Row']
      }
      push_live_question: {
        Args: {
          p_session_id: number
          p_question_id: number
          p_time_limit_seconds?: number | null
        }
        Returns: Database['public']['Tables']['live_questions']['Row']
      }
      close_live_question: {
        Args: {
          p_live_question_id: number
        }
        Returns: Database['public']['Tables']['live_questions']['Row']
      }
      reveal_live_question: {
        Args: {
          p_live_question_id: number
        }
        Returns: Database['public']['Tables']['live_questions']['Row']
      }
      mark_live_answer: {
        Args: {
          p_answer_id: number
          p_correct: boolean
          p_feedback?: string | null
        }
        Returns: Database['public']['Tables']['live_answers']['Row']
      }
      set_live_question_settings: {
        Args: {
          p_settings: Json
        }
        Returns: undefined
      }
      submit_live_answer: {
        Args: {
          p_live_question_id: number
          p_student_id: number
          p_answer: Json
        }
        Returns: Json
      }
      portal_live_state: {
        Args: {
          p_student_id: number
        }
        Returns: Json
      }
      set_portal_terms: {
        Args: {
          p_title: string
          p_text: string
        }
        Returns: number
      }
      portal_onboarding: {
        Args: Record<string, never>
        Returns: Json
      }
      portal_accept_terms: {
        Args: {
          p_version: number
          p_consents: Json
        }
        Returns: undefined
      }
      set_portal_consents: {
        Args: {
          p_settings: Json
        }
        Returns: undefined
      }
      student_has_consent: {
        Args: {
          p_student_id: number
          p_kind: string
        }
        Returns: boolean
      }
      portal_set_consent: {
        Args: {
          p_student_id: number
          p_kind: string
          p_granted: boolean
        }
        Returns: undefined
      }
      class_session_roster: {
        Args: {
          p_session_id: number
        }
        Returns: { student_id: number; full_name: string }[]
      }
      lesson_zoom_minutes: {
        Args: {
          p_schedule_id: number
          p_lesson_date: string
        }
        Returns: { student_id: number; minutes: number; counts_as_present: boolean }[]
      }
      set_zoom_attendance: {
        Args: {
          p_present_percent: number
        }
        Returns: undefined
      }
      portal_home: {
        Args: {
          p_student_id: number
        }
        Returns: Json
      }
      save_subject: {
        Args: {
          p_id: number | null
          p_name: string
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['subjects']['Row']
      }
      save_review_criterion: {
        Args: {
          p_id: number | null
          p_name: string
          p_description: string | null
          p_max_score: number | null
          p_remark_required_at_or_below: number | null
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['review_criteria']['Row']
      }
      set_zoom_meeting_options: {
        Args: {
          p_options: Json
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
            status: string
          }[]
          p_student_reviews: {
            student_id: number
            lessonRemark?: string | null
            scores: { criterion_id: number; score: number; remark: string | null }[]
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
