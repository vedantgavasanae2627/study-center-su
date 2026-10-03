export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          center_id: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
          username_or_email: string
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          full_name?: string
          id: string
          updated_at?: string
          username_or_email: string
        }
        Update: {
          center_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          username_or_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      book_copies: {
        Row: {
          book_id: string
          created_at: string
          current_center_id: string | null
          current_student_id: string | null
          id: string
          status: string
          sticker_id: string
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          current_center_id?: string | null
          current_student_id?: string | null
          id?: string
          status?: string
          sticker_id: string
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          current_center_id?: string | null
          current_student_id?: string | null
          id?: string
          status?: string
          sticker_id?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "master_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_copies_current_center_id_fkey"
            columns: ["current_center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_copies_current_student_id_fkey"
            columns: ["current_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_copies_transfer_fk"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      book_donations: {
        Row: {
          author: string
          book_name: string
          center_id: string
          condition: string
          created_at: string
          id: string
          prn: string
          status: string
          sticker_id: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          author?: string
          book_name: string
          center_id: string
          condition?: string
          created_at?: string
          id?: string
          prn?: string
          status?: string
          sticker_id: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          author?: string
          book_name?: string
          center_id?: string
          condition?: string
          created_at?: string
          id?: string
          prn?: string
          status?: string
          sticker_id?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_donations_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_donations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      book_requests: {
        Row: {
          admin_remarks: string
          book_id: string
          center_id: string
          created_at: string
          id: string
          quantity_needed: number
          status: Database["public"]["Enums"]["book_request_status"]
          updated_at: string
        }
        Insert: {
          admin_remarks?: string
          book_id: string
          center_id: string
          created_at?: string
          id?: string
          quantity_needed?: number
          status?: Database["public"]["Enums"]["book_request_status"]
          updated_at?: string
        }
        Update: {
          admin_remarks?: string
          book_id?: string
          center_id?: string
          created_at?: string
          id?: string
          quantity_needed?: number
          status?: Database["public"]["Enums"]["book_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_requests_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "master_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_requests_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_inventory: {
        Row: {
          book_id: string
          center_id: string
          created_at: string
          currently_available: number
          currently_borrowed: number
          id: string
          last_issued_date: string | null
          total_allocated: number
          updated_at: string
        }
        Insert: {
          book_id: string
          center_id: string
          created_at?: string
          currently_available?: number
          currently_borrowed?: number
          id?: string
          last_issued_date?: string | null
          total_allocated?: number
          updated_at?: string
        }
        Update: {
          book_id?: string
          center_id?: string
          created_at?: string
          currently_available?: number
          currently_borrowed?: number
          id?: string
          last_issued_date?: string | null
          total_allocated?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_inventory_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "master_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_inventory_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          book_id: string
          copy_ids: string[] | null
          created_at: string
          from_center_id: string | null
          id: string
          quantity: number
          status: Database["public"]["Enums"]["transfer_status"]
          to_center_id: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
          updated_at: string
        }
        Insert: {
          book_id: string
          copy_ids?: string[] | null
          created_at?: string
          from_center_id?: string | null
          id?: string
          quantity: number
          status?: Database["public"]["Enums"]["transfer_status"]
          to_center_id: string
          transfer_type?: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Update: {
          book_id?: string
          copy_ids?: string[] | null
          created_at?: string
          from_center_id?: string | null
          id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["transfer_status"]
          to_center_id?: string
          transfer_type?: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "master_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_from_center_id_fkey"
            columns: ["from_center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_center_id_fkey"
            columns: ["to_center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      master_books: {
        Row: {
          author: string
          created_at: string
          id: string
          title: string
          total_university_quantity: number
          updated_at: string
        }
        Insert: {
          author?: string
          created_at?: string
          id?: string
          title: string
          total_university_quantity?: number
          updated_at?: string
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          title?: string
          total_university_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      student_transactions: {
        Row: {
          book_id: string
          center_id: string
          copy_id: string | null
          created_at: string
          due_date: string
          fine_amount: number
          id: string
          issue_date: string
          return_date: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          center_id: string
          copy_id?: string | null
          created_at?: string
          due_date: string
          fine_amount?: number
          id?: string
          issue_date?: string
          return_date?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          center_id?: string
          copy_id?: string | null
          created_at?: string
          due_date?: string
          fine_amount?: number
          id?: string
          issue_date?: string
          return_date?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_transactions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "master_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transactions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transactions_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "book_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          branch: string
          center_id: string
          college_name: string
          course: string | null
          created_at: string
          email: string | null
          enrollment_year: number | null
          full_name: string
          id: string
          phone: string | null
          prn: string
          semester: number
          student_id: string | null
          updated_at: string
          user_id: string | null
          year_of_study: number | null
        }
        Insert: {
          branch?: string
          center_id: string
          college_name?: string
          course?: string | null
          created_at?: string
          email?: string | null
          enrollment_year?: number | null
          full_name: string
          id?: string
          phone?: string | null
          prn: string
          semester?: number
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
          year_of_study?: number | null
        }
        Update: {
          branch?: string
          center_id?: string
          college_name?: string
          course?: string | null
          created_at?: string
          email?: string | null
          enrollment_year?: number | null
          full_name?: string
          id?: string
          phone?: string | null
          prn?: string
          semester?: number
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
          year_of_study?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "study_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      study_centers: {
        Row: {
          center_name: string
          created_at: string
          id: string
          location: string
          updated_at: string
        }
        Insert: {
          center_name: string
          created_at?: string
          id?: string
          location: string
          updated_at?: string
        }
        Update: {
          center_name?: string
          created_at?: string
          id?: string
          location?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      my_center_id: { Args: { _user_id: string }; Returns: string }
      my_student_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "MAIN_ADMIN" | "SUB_ADMIN" | "STUDY_CENTER" | "STUDENT"
      book_request_status: "SENT" | "ACCEPTED" | "REJECTED"
      transaction_status: "ISSUED" | "RETURNED" | "RENEWED"
      transfer_status: "PENDING" | "DISPATCHED" | "RECEIVED"
      transfer_type: "RESTOCK" | "IDLE_RELOCATION"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER", "STUDENT"],
      book_request_status: ["SENT", "ACCEPTED", "REJECTED"],
      transaction_status: ["ISSUED", "RETURNED", "RENEWED"],
      transfer_status: ["PENDING", "DISPATCHED", "RECEIVED"],
      transfer_type: ["RESTOCK", "IDLE_RELOCATION"],
    },
  },
} as const
