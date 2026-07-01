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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
