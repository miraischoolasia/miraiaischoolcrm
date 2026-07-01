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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
