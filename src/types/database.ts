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
          recording_library_id?: number | null
          category_name?: string | null
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
          category_name?: string | null
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
          category_name?: string | null
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
          effective_permissions: Json
          created_at: string
          updated_at: string
          zoom_host_user: string | null
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
          grade_level?: number | null
          grade_year?: number | null
          student_code: string | null
          name_zh: string | null
          student_kind: string | null
          consultant_id: number | null
          second_parent_phone: string | null
          sales_person_id: number | null
          membership: string | null
          fb_name: string | null
          region: string | null
          enrol_method: string | null
          payment_mode: string | null
          hero_member: string | null
          fee_month: number | null
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
          grade_level?: number | null
          grade_year?: number | null
          student_code?: string | null
          name_zh?: string | null
          student_kind?: string | null
          consultant_id?: number | null
          second_parent_phone?: string | null
          sales_person_id?: number | null
          membership?: string | null
          fb_name?: string | null
          region?: string | null
          enrol_method?: string | null
          payment_mode?: string | null
          hero_member?: string | null
          fee_month?: number | null
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
          grade_level?: number | null
          grade_year?: number | null
          student_code?: string | null
          name_zh?: string | null
          student_kind?: string | null
          consultant_id?: number | null
          second_parent_phone?: string | null
          sales_person_id?: number | null
          membership?: string | null
          fb_name?: string | null
          region?: string | null
          enrol_method?: string | null
          payment_mode?: string | null
          hero_member?: string | null
          fee_month?: number | null
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
      lesson_seats: {
        Row: {
          id: number
          student_id: number
          kind: string
          from_classroom_id: number
          from_date: string
          to_classroom_id: number
          to_date: string
          note: string | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: number
          student_id: number
          kind: string
          from_classroom_id: number
          from_date: string
          to_classroom_id: number
          to_date: string
          note?: string | null
          created_by?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          student_id?: number
          kind?: string
          from_classroom_id?: number
          from_date?: string
          to_classroom_id?: number
          to_date?: string
          note?: string | null
          created_by?: number | null
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
          // A PIC name linked to an account (20261026010000).
          teacher_id?: number | null
          // The school's own order (20261101250000); null until moved.
          sort_order?: number | null
          // A source's Data Center bucket key (20261101400000); null = the default bucket.
          report_bucket?: string | null
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
          series_id: number | null
          series_date: string | null
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
          series_id?: number | null
          series_date?: string | null
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
          series_id?: number | null
          series_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Short name and colour of each inbox channel (20261027700000).
      channel_labels: {
        Row: { channel_key: string; short_name: string | null; color: string | null; updated_at: string }
        Insert: { channel_key: string; short_name?: string | null; color?: string | null; updated_at?: string }
        Update: { short_name?: string | null; color?: string | null; updated_at?: string }
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
          zone: 'marketing' | 'students'
          created_at: string
        }
        Insert: {
          id?: number
          label: string
          phone?: string | null
          chatwoot_inbox_id: number
          evolution_instance?: string | null
          is_active?: boolean
          zone?: 'marketing' | 'students'
          created_at?: string
        }
        Update: {
          id?: number
          label?: string
          phone?: string | null
          chatwoot_inbox_id?: number
          evolution_instance?: string | null
          is_active?: boolean
          zone?: 'marketing' | 'students'
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
          flow_id: number | null
        }
        Insert: never
        Update: never
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
          owner_id: string | null
          // A follow-up template (20261102500000).
          followup_step?: number | null
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
          owner_id?: string | null
          followup_step?: number | null
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
          owner_id?: string | null
          followup_step?: number | null
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
      // Each staff member's own screen settings (20261031950000).
      user_ui_preferences: {
        Row: {
          teacher_id: number
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          teacher_id?: number
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          teacher_id?: number
          key?: string
          value?: Json
          updated_at?: string
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
          status: 'scheduled' | 'completed' | 'cancelled'
          completed_at: string | null
          cancelled_at: string | null
          calendar_item_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          lead_id: number
          starts_at: string
          link: string
          added_by?: string | null
          status?: 'scheduled' | 'completed' | 'cancelled'
          completed_at?: string | null
          cancelled_at?: string | null
          calendar_item_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          lead_id?: number
          starts_at?: string
          link?: string
          added_by?: string | null
          status?: 'scheduled' | 'completed' | 'cancelled'
          completed_at?: string | null
          cancelled_at?: string | null
          calendar_item_id?: number | null
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
          tag_ids: number[]
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
          tag_ids?: number[]
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
          tag_ids?: number[]
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
            | 'weekly_limit'
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
          family_weekly_cap: number
          updated_at: string
        }
        Insert: never
        Update: {
          paused?: boolean
          daily_cap?: number
          gap_seconds?: number
          send_from_hour?: number
          send_until_hour?: number
          family_weekly_cap?: number
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
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'trial_attended' | 'trial_absent' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword' | 'class_absent' | 'lessons_left' | 'birthday' | 'student_created' | 'app_account' | 'lead_stage' | 'lead_tag' | 'first_message_keyword' | 'class_alert' | 'student_care' | 'good_news'
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
          trigger_type: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'trial_attended' | 'trial_absent' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword' | 'class_absent' | 'lessons_left' | 'birthday' | 'student_created' | 'app_account' | 'lead_stage' | 'lead_tag' | 'first_message_keyword' | 'class_alert' | 'student_care' | 'good_news'
          enabled?: boolean
          graph?: Json
        }
        Update: {
          name?: string
          trigger_type?: 'class_start' | 'replacement_start' | 'trial_start' | 'zoom_start' | 'lesson_expiry' | 'account_fee_expiry' | 'club_fee_expiry' | 'lead_created' | 'form_submitted' | 'parent_no_reply' | 'parent_waiting' | 'trial_booked' | 'trial_attended' | 'trial_absent' | 'package_start' | 'lead_idle' | 'task_due' | 'message_keyword' | 'class_absent' | 'lessons_left' | 'birthday' | 'student_created' | 'app_account' | 'lead_stage' | 'lead_tag' | 'first_message_keyword' | 'class_alert' | 'student_care' | 'good_news'
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
          name_zh: string | null
          second_parent_phone: string | null
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
          name_zh?: string | null
          second_parent_phone?: string | null
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
          name_zh?: string | null
          second_parent_phone?: string | null
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
          fb_group_url: string | null
          zoom_link: string | null
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
          fb_group_url?: string | null
          zoom_link?: string | null
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
          fb_group_url?: string | null
          zoom_link?: string | null
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
          replacement_schedule_id: number | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          id?: number
          schedule_id: number
          exception_date: string
          reason?: string | null
          moved_to_schedule_id?: number | null
          replacement_schedule_id?: number | null
          created_by?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          schedule_id?: number
          exception_date?: string
          reason?: string | null
          moved_to_schedule_id?: number | null
          replacement_schedule_id?: number | null
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
          grade_level?: number | null
          grade_year?: number | null
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
          host_user: string | null
          fb_live_wanted: boolean
          fb_live_id: string | null
          fb_live_url: string | null
          fb_live_error: string | null
          fb_live_started_at: string | null
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
          leave_reason: string | null
          dropped: boolean
          is_host: boolean
          stranger_cleared_at: string | null
          stranger_cleared_by: number | null
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
          leave_reason?: string | null
          dropped?: boolean
          is_host?: boolean
          stranger_cleared_at?: string | null
          stranger_cleared_by?: number | null
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
          leave_reason?: string | null
          dropped?: boolean
          is_host?: boolean
          stranger_cleared_at?: string | null
          stranger_cleared_by?: number | null
          created_at?: string
        }
        Relationships: []
      }
      class_session_notes: {
        Row: {
          session_id: number
          student_id: number
          note: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          session_id: number
          student_id: number
          note: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          session_id?: number
          student_id?: number
          note?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: []
      }
      lesson_late_reminders: {
        Row: {
          id: number
          session_id: number
          student_id: number
          sent_via: string
          sent_at: string
          sent_by: number | null
        }
        Insert: {
          id?: number
          session_id: number
          student_id: number
          sent_via: string
          sent_at?: string
          sent_by?: number | null
        }
        Update: {
          id?: number
          session_id?: number
          student_id?: number
          sent_via?: string
          sent_at?: string
          sent_by?: number | null
        }
        Relationships: []
      }
      class_session_question_plan: {
        Row: {
          session_id: number
          question_id: number
          position: number
        }
        Insert: {
          session_id: number
          question_id: number
          position: number
        }
        Update: {
          session_id?: number
          question_id?: number
          position?: number
        }
        Relationships: []
      }
      student_zoom_checks: {
        Row: {
          id: number
          student_id: number
          ok: boolean
          platform: string | null
          checked_at: string
          checked_by: string | null
        }
        Insert: {
          id?: never
          student_id: number
          ok: boolean
          platform?: string | null
          checked_at?: string
          checked_by?: string | null
        }
        Update: {
          id?: never
          student_id?: number
          ok?: boolean
          platform?: string | null
          checked_at?: string
          checked_by?: string | null
        }
        Relationships: []
      }
      class_session_lesson_notes: {
        Row: {
          id: number
          session_id: number
          title: string
          body: string
          published_at: string | null
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          session_id: number
          title: string
          body: string
          published_at?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          title?: string
          body?: string
          published_at?: string | null
          created_by?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      zoom_waiting: {
        Row: {
          id: number
          session_id: number
          student_id: number | null
          participant_uuid: string
          user_name: string | null
          entered_at: string
          left_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          session_id: number
          student_id?: number | null
          participant_uuid: string
          user_name?: string | null
          entered_at: string
          left_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          student_id?: number | null
          participant_uuid?: string
          user_name?: string | null
          entered_at?: string
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
          bunny_library_id: string | null
          bunny_video_id: string | null
          bunny_status: 'sending' | 'sent' | 'ready' | 'failed' | 'no_library' | null
          bunny_detail: string | null
          zoom_deleted_at: string | null
          updated_at: string
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
          programme_id?: number | null
          // Primary / secondary for fee estimates in the Data Center (20261101400000).
          fee_level?: 'primary' | 'secondary' | null
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
      class_categories: {
        Row: {
          name: string
          kind: 'regular' | 'trial' | 'camp'
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          kind: 'regular' | 'trial' | 'camp'
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          kind?: 'regular' | 'trial' | 'camp'
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
      // The Fee Calculator (20261030300000_fee_calculator.sql). Read with the fee_calculator tick; written by RPC only.
      fee_cohorts: {
        Row: {
          id: number
          membership_field: string
          membership_name: string
          sort_order: number
          is_active: boolean
          // The group whose prices this one uses (20261101520000); null = its own.
          uses_cohort_id?: number | null
          materials_included_in_tuition: boolean
          created_at: string
          updated_at: string
          updated_by: number | null
        }
        Insert: { membership_name: string; sort_order?: number; is_active?: boolean; materials_included_in_tuition?: boolean }
        Update: { sort_order?: number; is_active?: boolean; materials_included_in_tuition?: boolean }
        Relationships: []
      }
      fee_rates: {
        Row: { cohort_id: number; level: string; track: string; subject_count: number; cycle_tier: string; amount: number }
        Insert: { cohort_id: number; level: string; track: string; subject_count: number; cycle_tier: string; amount: number }
        Update: { amount?: number }
        Relationships: []
      }
      fee_subjects: {
        Row: {
          id: number
          level: string
          code: string
          label: string
          kind: string
          sort_order: number
          is_active: boolean
          subject_id?: number | null
          created_at: string
          updated_at: string
        }
        Insert: { level: string; code: string; label: string; kind: string; sort_order?: number; is_active?: boolean }
        Update: { code?: string; label?: string; kind?: string; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      // Quotations (20261031100000_quotations.sql). Read with the quotations tick; written by the edge functions.
      quotations: {
        Row: {
          id: string
          public_token: string
          status: string
          lead_id: number | null
          conversation_id: number | null
          contact_id: number | null
          inbox_id: number | null
          phone: string | null
          child_name: string
          child_age: number | null
          age_group: string | null
          cohort_id: number
          level: string
          region: string
          enrol_method: string
          rate_tier: string
          months: number
          start_date: string
          registration_month: number | null
          subjects: Json
          bio_che_phy: Json
          payment_mode: string | null
          region_option: string | null
          fee_month: number | null
          discount_kind: string | null
          discount_value: number | null
          discount_reason: string | null
          discount_note: string | null
          discount_approved_by: number | null
          discount_approved_at: string | null
          price_snapshot: Json
          subtotal: number
          discount_amount: number
          total: number
          currency: string
          expires_at: string | null
          sales_person_id: number | null
          consultant_id: number | null
          reference_no: string
          payment_route: string
          rzp_link_id: string | null
          rzp_link_url: string | null
          rzp_payment_id: string | null
          bank_paid_on: string | null
          bank_reference: string | null
          payment_proof_path: string | null
          payment_note: string | null
          confirmed_by: number | null
          after_pay_url?: string | null
          contact_url?: string | null
          parent_said_paid_at?: string | null
          parent_said_wrong_at?: string | null
          payment_method: string | null
          paid_amount: number | null
          paid_at: string | null
          student_id: number | null
          fulfil_status: string | null
          fulfil_error: string | null
          login_status: string | null
          receipt_path: string | null
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // §15 (20261031900000_quotation_links_qr.sql): each staff member's after-payment and contact links.
      quotation_staff_links: {
        Row: { teacher_id: number; after_pay_url: string | null; contact_url: string | null; updated_at: string; updated_by: number | null }
        Insert: never
        Update: never
        Relationships: []
      }
      lead_conversions: {
        Row: {
          id: number
          lead_id: number
          student_id: number
          converted_at: string
          historical: boolean
          how: 'quotation' | 'upgrade' | 'new_student' | 'link' | 'backfill'
          sales_person_id: number | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      products: {
        Row: {
          id: number
          name: string
          category: string
          level_label: string | null
          price: number
          image_path: string | null
          track_stock: boolean
          low_stock_at: number
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
          updated_by: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      product_stock_moves: {
        Row: {
          id: number
          product_id: number
          qty: number
          kind: 'purchase' | 'sale' | 'adjust' | 'return'
          quotation_id: string | null
          note: string | null
          created_by: number | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // a view (20261101500000): each product's stock = the sum of its moves
      product_stock: {
        Row: { product_id: number; stock: number }
        Insert: never
        Update: never
        Relationships: []
      }
      meta_ad_accounts: {
        Row: { account_id: string; name: string | null; currency: string | null; timezone: string | null; status: number | null; last_pulled_at: string | null; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      ad_spend_daily: {
        Row: {
          ad_id: string
          day: string
          account_id: string
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          spend: number
          impressions: number
          clicks: number
          link_clicks: number
          conversations: number
          meta_leads: number
          pulled_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      meta_ads: {
        Row: {
          ad_id: string
          account_id: string
          name: string | null
          status: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          title: string | null
          body: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      meta_sync_runs: {
        Row: {
          id: number
          started_at: string
          finished_at: string | null
          trigger: 'schedule' | 'admin'
          dry_run: boolean
          since: string | null
          until: string | null
          rows_read: number
          rows_written: number
          ok: boolean | null
          error: string | null
          warnings: string[]
        }
        Insert: never
        Update: never
        Relationships: []
      }
      data_center_targets: {
        Row: { teacher_id: number; month: string; people: number; subjects: number; updated_at: string; updated_by: number | null }
        Insert: never
        Update: never
        Relationships: []
      }
      quotation_classes: {
        Row: { id: number; quotation_id: string; subject_code: string; classroom_id: number }
        Insert: never
        Update: never
        Relationships: []
      }
      fee_settings: {
        Row: { key: string; value: Json; updated_at: string; updated_by: number | null }
        Insert: { key: string; value: Json }
        Update: { value?: Json }
        Relationships: []
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
      classroom_teachers: {
        Row: { classroom_id: number; teacher_id: number; created_at: string }
        Insert: { classroom_id: number; teacher_id: number }
        Update: { classroom_id?: number; teacher_id?: number }
        Relationships: []
      }
      student_month_plans: {
        Row: {
          id: number
          student_id: number
          classroom_id: number
          start_date: string
          months: number
          end_date: string
          remark: string | null
          is_active: boolean
          created_by: number | null
          created_at: string
        }
        Insert: { student_id: number; classroom_id: number; start_date: string; months: number; end_date: string }
        Update: { is_active?: boolean }
        Relationships: []
      }
      lesson_substitutes: {
        Row: { schedule_id: number; lesson_date: string; teacher_id: number; created_by: number | null; created_at: string }
        Insert: { schedule_id: number; lesson_date: string; teacher_id: number }
        Update: { schedule_id?: number; lesson_date?: string; teacher_id?: number }
        Relationships: []
      }
      // Teams and their people (20261026000000). Changed only through save_team / set_team_members.
      teams: {
        Row: {
          id: number
          name: string
          color: string | null
          description: string | null
          permissions: Json
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      team_members: {
        Row: { team_id: number; teacher_id: number; added_at: string }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      // Who may use each inbox channel (20261026020000). Changed only through set_inbox_channel.
      inbox_channels: {
        Row: {
          chatwoot_inbox_id: number
          kind: 'whatsapp' | 'messenger' | 'instagram' | 'other'
          label: string
          access: 'open' | 'limited'
          is_active: boolean
          zone: 'marketing' | 'students'
          created_at: string
          updated_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      inbox_channel_access: {
        Row: { id: number; chatwoot_inbox_id: number; team_id: number | null; teacher_id: number | null; level: 'view' | 'reply'; created_at: string }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      // Working hours, time off and swaps (20261026030000). Changed only through the admin functions.
      staff_notifications: {
        Row: {
          id: number
          teacher_id: number
          title: string
          body: string
          lead_id: number | null
          student_id: number | null
          flow_id: number | null
          created_at: string
          read_at: string | null
        }
        Insert: never
        Update: {
          read_at?: string | null
        }
        Relationships: []
      }
      progress_card_sends: {
        Row: {
          id: number
          student_id: number
          month: string
          sent_by: number | null
          sent_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      gallery_folders: {
        Row: {
          id: number
          parent_id: number | null
          name: string
          created_by: number | null
          created_at: string
          deleted_at: string | null
          deleted_batch: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      gallery_files: {
        Row: {
          id: number
          folder_id: number | null
          name: string
          path: string
          mime: string
          kind: 'image' | 'video' | 'audio' | 'document'
          size_bytes: number
          uploaded_by: number | null
          uploaded_by_name: string | null
          created_at: string
          deleted_at: string | null
          deleted_batch: string | null
          deleted_by_name: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      staff_shifts: {
        Row: {
          id: number
          teacher_id: number
          weekday: number
          start_time: string
          end_time: string
          effective_from: string
          effective_to: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      staff_roster_changes: {
        Row: {
          id: number
          teacher_id: number
          starts_at: string
          ends_at: string
          change: 'off' | 'extra'
          reason: string | null
          swap_id: string | null
          note: string | null
          created_by: number | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      classroom_teacher_libraries: {
        Row: { classroom_id: number; teacher_id: number; library_id: number }
        Insert: { classroom_id: number; teacher_id: number; library_id: number }
        Update: { classroom_id?: number; teacher_id?: number; library_id?: number }
        Relationships: []
      }
      class_videos: {
        Row: {
          id: number
          classroom_id: number
          teacher_id: number | null
          title: string
          description: string | null
          year: number
          month: number
          lesson_date: string | null
          bunny_library_id: string
          bunny_video_id: string
          status: 'uploading' | 'processing' | 'ready' | 'failed'
          source: 'upload' | 'zoom' | 'import'
          recording_id: number | null
          views: number
          legacy_id: string | null
          is_archived: boolean
          created_by: number | null
          created_at: string
          updated_at: string
        }
        Insert: { id?: never; classroom_id: number; title: string; year: number; month: number; bunny_library_id: string; bunny_video_id: string }
        Update: { id?: never }
        Relationships: []
      }
      student_field_options: {
        Row: { field: string; name: string; sort_order: number; is_active: boolean; created_at: string; updated_at: string }
        Insert: { field: string; name: string; sort_order?: number; is_active?: boolean }
        Update: { name?: string; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      student_kinds: {
        Row: { name: string; sort_order: number; is_active: boolean; created_at: string; updated_at: string }
        Insert: { name: string; sort_order?: number; is_active?: boolean }
        Update: { name?: string; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      student_video_grants: {
        Row: {
          id: number
          student_id: number
          age_group: string | null
          subject_id: number | null
          classroom_id: number | null
          year: number
          month: number
          starts_on: string | null
          ends_on: string | null
          created_by: number | null
          created_at: string
        }
        Insert: {
          student_id: number
          age_group?: string | null
          subject_id?: number | null
          classroom_id?: number | null
          year: number
          month: number
          starts_on?: string | null
          ends_on?: string | null
        }
        Update: {
          starts_on?: string | null
          ends_on?: string | null
        }
        Relationships: []
      }
      student_video_access: {
        Row: {
          id: number
          student_id: number
          classroom_id: number
          year: number
          month: number
          starts_on: string | null
          ends_on: string | null
          created_by: number | null
          created_at: string
        }
        Insert: { id?: never; student_id: number; classroom_id: number; year: number; month: number }
        Update: { id?: never }
        Relationships: []
      }
      class_video_progress: {
        Row: {
          student_id: number
          video_id: number
          watch_percentage: number
          watch_seconds: number
          rewatch_count: number
          opened_at: string
          last_watched_at: string
          completed_at: string | null
        }
        Insert: { student_id: number; video_id: number }
        Update: { watch_percentage?: number }
        Relationships: []
      }
      // Team replies page: kept days, written only by the team-replies function.
      team_reply_days: {
        Row: {
          day: string
          replier: string
          staff_id: number | null
          replies: number
          chat_ids: number[]
          waits: number[]
          within_target: number
          slowest: number | null
          duty_waits?: number[]
          duty_within_target?: number
          duty_slowest?: number | null
          inbox_id?: number
          done_chat_ids?: number[]
          computed_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      // Team Replies per channel (20261026900000).
      team_channel_days: {
        Row: {
          day: string
          inbox_id: number
          incoming_messages: number
          incoming_chat_ids: number[]
          replied_chat_ids: number[]
          done_chat_ids: number[]
          first_waits: number[]
          duty_first_waits: number[]
          computed_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      // One chat's scheduled messages and flow starts (20261025600000).
      chat_schedules: {
        Row: {
          id: number
          kind: string
          conversation_id: number
          message: string | null
          media_url: string | null
          flow_id: number | null
          run_at: string
          cancel_on_reply: boolean
          status: string
          created_by_name: string | null
          created_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      // Inbox sticker library (20261025500000).
      inbox_stickers: {
        Row: { id: number; path: string; name: string | null; sort_order: number; is_active: boolean; created_at: string }
        Insert: { path: string; name?: string | null; sort_order?: number; is_active?: boolean }
        Update: { name?: string | null; sort_order?: number; is_active?: boolean }
        Relationships: []
      }
      // The inbox copy (20261024800000 + 20261025300000): only what the Inbox page reads back.
      inbox_chats: {
        Row: {
          conversation_id: number
          inbox_id: number | null
          contact_id: number | null
          status: string | null
          last_activity_at: string | null
          copied_at: string | null
          needs_copy: boolean
          raw: Json | null
          last_message_raw: Json | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      inbox_messages: {
        Row: {
          id: number
          conversation_id: number
          created_at: string
          raw: Json | null
          // 0 from the parent, 1 from us (read for Facebook's 24-hour rule when forwarding).
          message_type: number
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      team_reply_day_runs: {
        Row: {
          day: string
          computed_at: string
          source: string
          chats_read: number
          replies: number
        }
        Insert: Record<string, never>
        Update: Record<string, never>
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
      // Team Replies (20261024810000): today worked out on the spot, and "Work out the days".
      team_reply_today: {
        Args: Record<PropertyKey, never>
        Returns: {
          day: string
          replier: string
          staff_id: number | null
          replies: number
          chat_ids: number[]
          waits: number[]
          within_target: number
          slowest: number | null
          duty_waits?: number[]
          duty_within_target?: number
          duty_slowest?: number | null
          inbox_id?: number
          done_chat_ids?: number[]
        }[]
      }
      team_channel_today: {
        Args: Record<PropertyKey, never>
        Returns: {
          day: string
          inbox_id: number
          incoming_messages: number
          incoming_chat_ids: number[]
          replied_chat_ids: number[]
          done_chat_ids: number[]
          first_waits: number[]
          duty_first_waits: number[]
        }[]
      }
      team_reply_compute_range: {
        Args: { p_first: string; p_last: string }
        Returns: number
      }
      // The inbox copy (20261024800000): "Copy old chats" writes through these.
      inbox_copy_import: {
        Args: { p_account: number | null; p_chat: Json; p_messages: Json; p_done?: boolean }
        Returns: number
      }
      // Weekly repeat on the calendar (20261031700000).
      calendar_series_extend: {
        Args: { p_series_id?: number | null }
        Returns: number
      }
      calendar_series_create: {
        Args: {
          p_kind: string
          p_title: string
          p_notes: string | null
          p_start_date: string
          p_weekdays: number[]
          p_start_time: string | null
          p_end_time: string | null
          p_zoom_link: string | null
          p_assignee_id: number | null
          p_until_date?: string | null
        }
        Returns: number
      }
      calendar_series_update: {
        Args: { p_series_id: number; p_patch: Record<string, unknown>; p_from_date?: string | null }
        Returns: undefined
      }
      calendar_series_delete: {
        Args: { p_series_id: number; p_from_date?: string | null }
        Returns: undefined
      }
      chat_schedule_message: {
        Args: {
          p_conversation_id: number
          p_contact_id: number | null
          p_inbox_id: number | null
          p_channel: string
          p_phone: string | null
          p_lead_id: number | null
          p_parent_name: string | null
          p_message: string
          p_media_url: string | null
          p_run_at: string
          p_cancel_on_reply?: boolean
        }
        Returns: number
      }
      chat_schedule_flow: {
        Args: {
          p_conversation_id: number
          p_contact_id: number | null
          p_inbox_id: number | null
          p_channel: string
          p_phone: string | null
          p_lead_id: number | null
          p_parent_name: string | null
          p_flow_id: number
          p_run_at: string
          p_cancel_on_reply?: boolean
        }
        Returns: number
      }
      chat_flow_state: {
        Args: { p_conversation_id: number; p_inbox_id: number | null; p_phone: string | null; p_lead_id: number | null; p_flow_id: number }
        Returns: Json
      }
      gallery_settings: { Args: Record<PropertyKey, never>; Returns: Json }
      set_gallery_settings: { Args: { p_value: Json }; Returns: Json }
      gallery_usage: { Args: Record<PropertyKey, never>; Returns: Json }
      gallery_add_file: { Args: { p_path: string; p_name: string; p_folder_id?: number | null }; Returns: number }
      gallery_add_folder: { Args: { p_name: string; p_parent_id?: number | null }; Returns: number }
      gallery_rename: { Args: { p_kind: string; p_id: number; p_name: string }; Returns: undefined }
      gallery_move: { Args: { p_file_ids: number[]; p_folder_ids: number[]; p_to: number | null }; Returns: undefined }
      gallery_trash: { Args: { p_file_ids: number[]; p_folder_ids: number[] }; Returns: string }
      gallery_restore: { Args: { p_file_ids: number[]; p_folder_ids: number[] }; Returns: undefined }
      gallery_forget: { Args: { p_file_ids: number[]; p_folder_ids: number[] }; Returns: undefined }
      chat_start_flow: {
        Args: {
          p_conversation_id: number
          p_contact_id: number | null
          p_inbox_id: number | null
          p_channel: string
          p_phone: string | null
          p_lead_id: number | null
          p_parent_name: string | null
          p_flow_id: number
          p_restart?: boolean
        }
        Returns: Json
      }
      chat_schedule_change: {
        Args: { p_id: number; p_message: string | null; p_media_url: string | null; p_run_at: string; p_cancel_on_reply: boolean }
        Returns: undefined
      }
      chat_schedule_cancel: {
        Args: { p_id: number }
        Returns: undefined
      }
      inbox_recent_stickers: {
        Args: { p_limit?: number }
        Returns: { url: string | null; name: string | null; size: number | null; sent_at: string }[]
      }
      inbox_recent_messages: {
        Args: { p_conversation_ids: number[]; p_per_chat?: number }
        Returns: { conversation_id: number; raw: Json | null }[]
      }
      inbox_copy_fill: {
        Args: { p_account: number | null; p_chat: Json; p_messages: Json }
        Returns: number
      }
      inbox_search: {
        Args: { p_query: string; p_limit?: number }
        Returns: {
          kind: string
          conversation_id: number
          message_id: number | null
          created_at: string | null
          snippet: string | null
          chat: Json | null
          last_message: Json | null
        }[]
      }
      inbox_copy_state: {
        Args: Record<PropertyKey, never>
        Returns: { conversation_id: number; copied_at: string | null; needs_copy: boolean; newest_message_id: number | null }[]
      }
      inbox_copy_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          chats: number
          messages: number
          copied_chats: number
          chats_to_copy: number
          first_message_at: string | null
          last_message_at: string | null
        }[]
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
      // 20261024900000: each table's change number, so the page reads again only what changed.
      crm_table_versions: {
        Args: { p_tables: string[] }
        Returns: { table_name: string; present: boolean; tracked: boolean; version: number }[]
      }
      // 20261024910000: the automation queue's numbers in one request.
      automation_snapshot: {
        Args: { p_since: string }
        Returns: Json
      }
      reorder_lead_stages: {
        Args: {
          p_keys: string[]
        }
        Returns: undefined
      }
      set_lead_option_order: {
        Args: {
          p_ids: number[]
        }
        Returns: undefined
      }
      link_pic_to_staff: {
        Args: {
          p_pic_id: number
          p_teacher_id: number | null
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
      mark_staff_notifications_read: {
        Args: {
          p_ids?: number[] | null
        }
        Returns: number
      }
      class_quality_settings: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      set_class_quality: {
        Args: { p_value: Json }
        Returns: Json
      }
      quality_lessons: {
        Args: { p_from: string; p_to: string }
        Returns: {
          session_id: number
          lesson_date: string
          status: string | null
          starts_at: string
          ends_at: string
          classroom_id: number | null
          classroom_name: string | null
          teacher_id: number
          substitute: boolean
          has_zoom: boolean
          marked: number
          attended: number
          participation_sum: number
          participation_count: number
          correct: number
          wrong: number
          questions: number
          teacher_joined_at: string | null
          started_on_time: boolean | null
          recording_at: string | null
          recording_on_time: boolean | null
          attendance_sent_at: string | null
          attendance_on_time: boolean | null
          present_logged: number
          commented: number
        }[]
      }
      quality_periods: {
        Args: { p_from: string; p_to: string }
        Returns: {
          period_id: number
          student_id: number
          student_name: string
          student_code: string | null
          classroom_id: number
          classroom_name: string
          teacher_id: number | null
          start_date: string | null
          end_date: string | null
        }[]
      }
      progress_card: {
        Args: { p_student: number; p_month: string }
        Returns: Json
      }
      mark_progress_card_sent: {
        Args: { p_student: number; p_month: string }
        Returns: string
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
      save_class_category: {
        Args: {
          p_name: string | null
          p_new_name: string | null
          p_kind: 'regular' | 'trial' | 'camp' | null
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['class_categories']['Row']
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
      set_teacher_zoom_host: {
        Args: {
          p_teacher_id: number
          p_host: string | null
        }
        Returns: undefined
      }
      set_zoom_hosts: {
        Args: {
          p_hosts: string[]
          p_per_host?: number
        }
        Returns: undefined
      }
      zoom_hosts_for_session: {
        Args: {
          p_session_id: number
        }
        Returns: { host_user: string; busy_with: string | null; meetings: number; preferred: boolean }[]
      }
      set_recording_settings: {
        Args: {
          p_delete_zoom_after_upload: boolean
        }
        Returns: undefined
      }
      recording_libraries_list: {
        Args: Record<string, never>
        Returns: { id: number; name: string; library_id: string; collection_id: string | null; has_key: boolean; classes: number }[]
      }
      save_recording_library: {
        Args: {
          p_id: number | null
          p_name: string
          p_library_id: string
          p_api_key: string
          p_collection_id: string | null
        }
        Returns: number
      }
      delete_recording_library: {
        Args: {
          p_id: number
        }
        Returns: undefined
      }
      set_classroom_recording_library: {
        Args: {
          p_classroom_id: number
          p_library_id: number | null
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
      set_age_display: {
        Args: {
          p_mode: string
        }
        Returns: undefined
      }
      set_zoom_attendance: {
        Args: {
          p_present_percent: number
        }
        Returns: undefined
      }
      set_zoom_room_rules: {
        Args: {
          p_drop_grace_seconds: number
          p_late_minutes: number
        }
        Returns: undefined
      }
      set_calendar_layout: {
        Args: {
          p_layout: string
        }
        Returns: undefined
      }
      set_calendar_month_weekly: {
        Args: {
          p_show: boolean
        }
        Returns: undefined
      }
      link_replacement_to_cancelled_day: {
        Args: {
          p_schedule_id: number
          p_occurrence_date: string
          p_replacement_schedule_id: number | null
        }
        Returns: undefined
      }
      set_late_reminder_settings: {
        Args: {
          p_after_minutes: number
          p_text: string
        }
        Returns: undefined
      }
      record_late_reminder: {
        Args: {
          p_session_id: number
          p_student_id: number
          p_sent_via: string
        }
        Returns: undefined
      }
      set_class_session_plan: {
        Args: {
          p_session_id: number
          p_question_ids: number[]
        }
        Returns: undefined
      }
      save_lesson_note: {
        Args: {
          p_id: number | null
          p_session_id: number | null
          p_title: string
          p_body: string
          p_publish: boolean
        }
        Returns: number
      }
      delete_lesson_note: {
        Args: {
          p_id: number
        }
        Returns: undefined
      }
      save_class_session_note: {
        Args: {
          p_session_id: number
          p_student_id: number
          p_note: string
        }
        Returns: undefined
      }
      clear_zoom_stranger: {
        Args: {
          p_participation_id: number
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
      add_student_to_classroom: {
        Args: { p_student_id: number; p_classroom_id: number }
        Returns: undefined
      }
      remove_student_from_classroom: {
        Args: { p_student_id: number; p_classroom_id: number }
        Returns: undefined
      }
      set_class_video_settings: {
        Args: { p_month_access: boolean }
        Returns: undefined
      }
      set_classroom_teacher_library: {
        Args: { p_classroom_id: number; p_teacher_id: number; p_library_id: number | null }
        Returns: undefined
      }
      set_class_videos_per_month: {
        Args: { p_count: number }
        Returns: undefined
      }
      set_program_level_flow: {
        Args: { p_name: string; p_programme_id: number | null }
        Returns: undefined
      }
      classroom_enrol_flow: {
        Args: { p_classroom_id: number }
        Returns: number | null
      }
      set_classroom_teachers: {
        Args: { p_classroom_id: number; p_teacher_ids: number[] }
        Returns: undefined
      }
      convert_hoa_student: {
        Args: {
          p_student_id: number
          p_classroom_id: number
          p_start_date: string
          p_package_id?: number | null
          p_class_count?: number
          p_lesson_expiry_date?: string | null
          p_account_fee_expiry_date?: string | null
          p_mirai_club_expiry_date?: string | null
          p_months?: number | null
          p_lead_id?: number | null
        }
        Returns: number
      }
      set_student_code_enabled: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_student_tags: {
        Args: { p_student_id: number; p_tag_ids: number[] }
        Returns: undefined
      }
      set_person_tags: {
        Args: { p_person_id: number; p_tag_ids: number[] }
        Returns: undefined
      }
      set_student_fields: {
        Args: { p_value: Json }
        Returns: undefined
      }
      save_student_field_option: {
        Args: { p_field: string; p_name: string | null; p_new_name: string | null; p_sort_order: number | null; p_is_active: boolean | null }
        Returns: Database['public']['Tables']['student_field_options']['Row']
      }
      save_fee_cohort: {
        Args: {
          p_id: number | null
          p_membership_name: string | null
          p_sort_order: number | null
          p_is_active: boolean | null
          p_materials_included: boolean | null
        }
        Returns: Database['public']['Tables']['fee_cohorts']['Row']
      }
      save_fee_cohort_rates: {
        Args: { p_cohort_id: number; p_materials_included: boolean | null; p_rates: Json }
        Returns: undefined
      }
      set_fee_cohort_follow: {
        Args: { p_cohort_id: number; p_uses_cohort_id: number | null }
        Returns: undefined
      }
      copy_fee_cohort_rates: {
        Args: { p_cohort_id: number; p_from_cohort_id: number }
        Returns: number
      }
      save_fee_subject: {
        Args: {
          p_id: number | null
          p_level: string | null
          p_code: string | null
          p_label: string | null
          p_kind: string | null
          p_sort_order: number | null
          p_is_active: boolean | null
        }
        Returns: Database['public']['Tables']['fee_subjects']['Row']
      }
      save_fee_settings: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      set_fee_calculator_enabled: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_quotation_staff_link: {
        Args: { p_teacher_id: number; p_after_pay_url: string | null; p_contact_url: string | null }
        Returns: undefined
      }
      data_center_settings: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      set_data_center: {
        Args: { p_value: Json }
        Returns: Json
      }
      set_source_bucket: {
        Args: { p_option_id: number; p_bucket: string | null }
        Returns: undefined
      }
      set_program_level_fee_level: {
        Args: { p_name: string; p_fee_level: 'primary' | 'secondary' | null }
        Returns: undefined
      }
      lead_report_bucket: {
        Args: { p_source_id: number | null }
        Returns: string
      }
      data_center_followups: {
        Args: { p_month: string }
        Returns: { assignee_id: number | null; scheduled: number; done: number; on_time: number; overdue: number }[]
      }
      data_center_lc_report: {
        Args: { p_month: string }
        Returns: {
          lc_id: number | null
          lc_name: string
          students: number
          students_at_start: number
          students_still_in: number
          stays_at_start: number
          stays_added: number
          stays_stopped: number
          at_risk: number
          cards_due: number
          cards_sent: number
        }[]
      }
      data_center_lc_students: {
        Args: { p_month: string; p_lc_id: number | null }
        Returns: {
          student_id: number
          student_name: string
          student_code: string | null
          stopped_all: boolean
          reasons: string[]
          card_sent: boolean
        }[]
      }
      products_settings: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      set_products_settings: {
        Args: { p_value: Json }
        Returns: Json
      }
      save_product: {
        Args: {
          p_id: number | null
          p_name: string
          p_category: string
          p_level_label: string | null
          p_price: number
          p_image_path: string | null
          p_track_stock: boolean
          p_low_stock_at: number
          p_is_active: boolean
          p_sort_order: number | null
        }
        Returns: number
      }
      add_stock_move: {
        Args: { p_product_id: number; p_kind: 'purchase' | 'adjust' | 'return'; p_qty: number; p_note: string | null }
        Returns: number
      }
      meta_ads_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      data_center_ads: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ad_id: string | null
          ad_name: string | null
          title: string | null
          campaign_id: string | null
          campaign_name: string | null
          thumbnail_url: string | null
          status: string | null
          spend: number
          impressions: number
          clicks: number
          conversations: number
          meta_leads: number
          leads: number
          trials: number
          conversions: number
          revenue_actual: number
          revenue_estimated: number
        }[]
      }
      data_center_ec_ads: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ec_id: number | null
          ec_name: string
          ad_leads: number
          conversions: number
          revenue_actual: number
          revenue_estimated: number
          spend_share: number
        }[]
      }
      data_center_ad_months: {
        Args: { p_month: string }
        Returns: Json
      }
      set_data_center_target: {
        Args: { p_teacher_id: number; p_month: string; p_people: number | null; p_subjects: number | null }
        Returns: undefined
      }
      data_center_overview: {
        Args: { p_month: string }
        Returns: Json
      }
      data_center_ec_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ec_id: number | null
          ec_name: string
          leads: number
          leads_by_bucket: Json
          conversions: number
          same_period: number
          cross_period: number
          subjects: number
          weighted_subjects: number
          revenue_actual: number
          paid_quotations: number
          revenue_estimated: number
          unknown_amounts: number
          avg_days: number | null
          median_days: number | null
          target_people: number
          target_subjects: number
        }[]
      }
      data_center_conversions: {
        Args: { p_from: string; p_to: string }
        Returns: {
          conversion_id: number
          lead_id: number
          lead_name: string
          lead_created_on: string
          source_bucket: string
          student_id: number
          student_name: string
          converted_on: string
          how: 'quotation' | 'upgrade' | 'new_student' | 'link' | 'backfill'
          sales_person_id: number | null
          sales_person_name: string | null
          subjects: number
          months: number
          amount: number | null
          amount_kind: 'actual' | 'estimated' | 'unknown'
          revenue_on: string
          quotation_id: string | null
          estimate_note: 'no_classes' | 'no_membership' | 'no_price_group' | 'no_level' | 'no_rate' | null
        }[]
      }
      set_quotation_settings: {
        Args: { p_value: Json }
        Returns: undefined
      }
      set_fee_subject_class_subject: {
        Args: { p_fee_subject_id: number; p_subject_id: number | null }
        Returns: undefined
      }
      set_student_roster_counts: {
        Args: { p_categories: string[]; p_changes_from: string | null }
        Returns: undefined
      }
      save_student_kind: {
        Args: { p_name: string | null; p_new_name: string | null; p_sort_order: number | null; p_is_active: boolean | null }
        Returns: Database['public']['Tables']['student_kinds']['Row']
      }
      add_student_month_plan: {
        Args: { p_student_id: number; p_classroom_id: number; p_start_date: string; p_months: number; p_remark?: string | null }
        Returns: Database['public']['Tables']['student_month_plans']['Row']
      }
      hide_student_month_plan: {
        Args: { p_id: number }
        Returns: undefined
      }
      set_lesson_substitute: {
        Args: { p_schedule_id: number; p_lesson_date: string; p_teacher_id: number | null }
        Returns: undefined
      }
      set_attendance_takers: {
        Args: { p_assistants: boolean; p_substitutes: boolean }
        Returns: undefined
      }
      can_take_attendance: {
        Args: { p_schedule_id: number; p_lesson_date: string }
        Returns: boolean
      }
      // Teams and permissions (20261026000000 .. 030000).
      permission_scope: {
        Args: { p_module: string; p_action?: string }
        Returns: 'all' | 'own_unassigned' | 'own' | null
      }
      save_team: {
        Args: { p_id: number | null; p_name: string; p_color: string | null; p_description: string | null; p_permissions: Json; p_is_active?: boolean }
        Returns: number
      }
      set_team_members: {
        Args: { p_team_id: number; p_teacher_ids: number[] }
        Returns: undefined
      }
      set_account_teams: {
        Args: { p_teacher_id: number; p_team_ids: number[] }
        Returns: undefined
      }
      reorder_teams: {
        Args: { p_team_ids: number[] }
        Returns: undefined
      }
      my_inbox_access: {
        Args: Record<string, never>
        Returns: Json
      }
      inbox_access_level: {
        Args: { p_inbox_id: number }
        Returns: 'reply' | 'view' | null
      }
      inbox_zone: {
        Args: { p_inbox_id: number }
        Returns: 'marketing' | 'students'
      }
      student_zone_inbox_ids: {
        Args: Record<string, never>
        Returns: number[]
      }
      chat_may_schedule: {
        Args: { p_inbox_id: number }
        Returns: boolean
      }
      set_inbox_channel: {
        Args: { p_inbox_id: number; p_kind: string; p_label: string; p_access: string; p_grants?: Json; p_is_active?: boolean }
        Returns: undefined
      }
      save_staff_week: {
        Args: { p_teacher_id: number; p_shifts: Json; p_from?: string | null }
        Returns: undefined
      }
      add_roster_change: {
        Args: { p_teacher_id: number; p_starts_at: string; p_ends_at: string; p_change: string; p_reason?: string | null; p_note?: string | null }
        Returns: number
      }
      add_shift_swap: {
        Args: { p_from_teacher_id: number; p_to_teacher_id: number; p_starts_at: string; p_ends_at: string; p_reason?: string | null; p_note?: string | null }
        Returns: string
      }
      delete_roster_change: {
        Args: { p_id: number }
        Returns: undefined
      }
      set_business_hours: {
        Args: { p_value: Json }
        Returns: undefined
      }
      set_leave_reasons: {
        Args: { p_reasons: Json }
        Returns: undefined
      }
      team_hours_in_use: {
        Args: Record<string, never>
        Returns: boolean
      }
      my_classroom_ids: {
        Args: Record<string, never>
        Returns: number[]
      }
      can_manage_class_videos: {
        Args: { p_classroom_id: number }
        Returns: boolean
      }
      update_class_video: {
        Args: {
          p_id: number
          p_title: string
          p_description: string | null
          p_year: number
          p_month: number
          p_lesson_date: string | null
        }
        Returns: Database['public']['Tables']['class_videos']['Row']
      }
      set_class_video_archived: {
        Args: { p_id: number; p_archived: boolean }
        Returns: undefined
      }
      set_student_video_grants: {
        Args: {
          p_student_ids: number[]
          p_age_group: string | null
          p_subject_id: number | null
          p_classroom_id: number | null
          p_months: { year: number; month: number }[]
          p_granted: boolean
          p_starts_on?: string | null
          p_ends_on?: string | null
        }
        Returns: number
      }
      can_grant_videos: {
        Args: Record<string, never>
        Returns: boolean
      }
      set_student_video_access: {
        Args: {
          p_student_id: number
          p_classroom_id: number
          p_year: number
          p_month: number
          p_granted: boolean
          p_starts_on?: string | null
          p_ends_on?: string | null
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
      today_roles: {
        Args: { p_teacher_id?: number | null }
        Returns: Json
      }
      today_ec: {
        Args: { p_teacher_id?: number | null }
        Returns: Json
      }
      today_lc: {
        Args: { p_teacher_id?: number | null }
        Returns: Json
      }
      today_teacher: {
        Args: { p_teacher_id?: number | null }
        Returns: Json
      }
      today_team: {
        Args: Record<string, never>
        Returns: Json
      }
      set_role_names: {
        Args: { p_ec: string; p_lc: string }
        Returns: undefined
      }
      set_trial_booking_grade: {
        Args: { p_booking_id: number; p_level: number | null; p_year: number | null }
        Returns: undefined
      }
      book_lesson_seat: {
        Args: {
          p_student_id: number
          p_kind: string
          p_from_classroom_id: number
          p_from_date: string
          p_to_classroom_id: number
          p_to_date: string
          p_note?: string | null
        }
        Returns: number
      }
      cancel_lesson_seat: {
        Args: {
          p_seat_id: number
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
