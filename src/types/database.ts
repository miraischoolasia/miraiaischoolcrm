export type Database = {
  public: {
    Tables: {
      teachers: {
        Row: {
          id: number
          auth_user_id: string | null
          username: string
          password_hash: string | null
          full_name: string
          email: string | null
          phone: string | null
          role: 'admin' | 'teacher'
          is_active: boolean
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
          role?: 'admin' | 'teacher'
          is_active?: boolean
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
          role?: 'admin' | 'teacher'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          id: number
          teacher_id: number | null
          full_name: string
          remaining_hours: number
          lesson_expiry_date: string
          account_fee_expiry_date: string
          mirai_club_expiry_date: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          teacher_id?: number | null
          full_name: string
          remaining_hours?: number
          lesson_expiry_date: string
          account_fee_expiry_date: string
          mirai_club_expiry_date: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          teacher_id?: number | null
          full_name?: string
          remaining_hours?: number
          lesson_expiry_date?: string
          account_fee_expiry_date?: string
          mirai_club_expiry_date?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'students_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'teachers'
            referencedColumns: ['id']
          },
        ]
      }
      schedules: {
        Row: {
          id: number
          teacher_id: number
          student_id: number | null
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
    }
    Views: Record<string, never>
    Functions: {
      create_student_record: {
        Args: {
          p_full_name: string
          p_teacher_id: number | null
          p_initial_hours: number
          p_lesson_expiry_date: string
          p_account_fee_expiry_date: string
          p_mirai_club_expiry_date: string
          p_notes: string | null
          p_actor_teacher_id?: number | null
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
      renew_student_record: {
        Args: {
          p_student_id: number
          p_add_hours: number
          p_new_lesson_expiry_date: string | null
          p_new_account_fee_expiry_date: string | null
          p_new_mirai_club_expiry_date: string | null
          p_remark: string | null
          p_actor_teacher_id?: number | null
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
          p_teacher_id: number
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
          }[]
        }
        Returns: {
          lesson_log_id: number
          revision_number: number
          updated_student_count: number
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
