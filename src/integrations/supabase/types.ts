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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_configurations: {
        Row: {
          ai_name: string
          auto_reply_instagram: boolean
          auto_reply_whatsapp: boolean
          business_description: string
          business_name: string
          company_policies: string
          creativity: string
          enabled: boolean
          faq: string
          forbidden_topics: string
          history_limit: number
          id: string
          opening_hours: string
          organization_id: string
          payment_methods: string
          prices: string
          products_services: string
          return_policy: string
          rules: string
          sales_strategy: string
          shipping_info: string
          tone_of_voice: string
          updated_at: string
        }
        Insert: {
          ai_name?: string
          auto_reply_instagram?: boolean
          auto_reply_whatsapp?: boolean
          business_description?: string
          business_name?: string
          company_policies?: string
          creativity?: string
          enabled?: boolean
          faq?: string
          forbidden_topics?: string
          history_limit?: number
          id?: string
          opening_hours?: string
          organization_id: string
          payment_methods?: string
          prices?: string
          products_services?: string
          return_policy?: string
          rules?: string
          sales_strategy?: string
          shipping_info?: string
          tone_of_voice?: string
          updated_at?: string
        }
        Update: {
          ai_name?: string
          auto_reply_instagram?: boolean
          auto_reply_whatsapp?: boolean
          business_description?: string
          business_name?: string
          company_policies?: string
          creativity?: string
          enabled?: boolean
          faq?: string
          forbidden_topics?: string
          history_limit?: number
          id?: string
          opening_hours?: string
          organization_id?: string
          payment_methods?: string
          prices?: string
          products_services?: string
          return_policy?: string
          rules?: string
          sales_strategy?: string
          shipping_info?: string
          tone_of_voice?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          input_tokens: number | null
          model: string
          organization_id: string
          output_tokens: number | null
          requested_by: string
          status: string
          total_tokens: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          organization_id: string
          output_tokens?: number | null
          requested_by: string
          status: string
          total_tokens?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          organization_id?: string
          output_tokens?: number | null
          requested_by?: string
          status?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_to: string | null
          created_at: string
          email: string | null
          id: string
          instagram_id: string | null
          last_interaction_at: string | null
          lead_score: number
          name: string
          notes: string | null
          organization_id: string
          phone: string
          source: string
          stage: Database["public"]["Enums"]["lead_stage"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram_id?: string | null
          last_interaction_at?: string | null
          lead_score?: number
          name: string
          notes?: string | null
          organization_id: string
          phone: string
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram_id?: string | null
          last_interaction_at?: string | null
          lead_score?: number
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          contact_id: string
          created_at: string
          handled_by_ai: boolean
          id: string
          last_message: string | null
          last_message_at: string
          organization_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          contact_id: string
          created_at?: string
          handled_by_ai?: boolean
          id?: string
          last_message?: string | null
          last_message_at?: string
          organization_id: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          contact_id?: string
          created_at?: string
          handled_by_ai?: boolean
          id?: string
          last_message?: string | null
          last_message_at?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          ig_user_id: string
          last_error: string | null
          last_sync_at: string | null
          organization_id: string
          status: string
          token_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          ig_user_id: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          ig_user_id?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_oauth_states: {
        Row: {
          created_at: string
          organization_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_tokens: {
        Row: {
          access_token: string
          account_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          delivery_status: string | null
          external_message_id: string | null
          failure_reason: string | null
          id: string
          message_type: string
          organization_id: string
          read_at: string | null
          sender: Database["public"]["Enums"]["message_sender"]
          sent_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          delivery_status?: string | null
          external_message_id?: string | null
          failure_reason?: string | null
          id?: string
          message_type?: string
          organization_id: string
          read_at?: string | null
          sender: Database["public"]["Enums"]["message_sender"]
          sent_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          delivery_status?: string | null
          external_message_id?: string | null
          failure_reason?: string | null
          id?: string
          message_type?: string
          organization_id?: string
          read_at?: string | null
          sender?: Database["public"]["Enums"]["message_sender"]
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          ai_tokens: number
          attendants: number | null
          connections: number
          created_at: string
          cta: string
          description: string
          features: string[]
          id: string
          monthly_price: number
          name: string
          popular: boolean
          sort_order: number
          updated_at: string
          yearly_discount_percent: number
        }
        Insert: {
          active?: boolean
          ai_tokens: number
          attendants?: number | null
          connections: number
          created_at?: string
          cta?: string
          description?: string
          features?: string[]
          id: string
          monthly_price: number
          name: string
          popular?: boolean
          sort_order?: number
          updated_at?: string
          yearly_discount_percent?: number
        }
        Update: {
          active?: boolean
          ai_tokens?: number
          attendants?: number | null
          connections?: number
          created_at?: string
          cta?: string
          description?: string
          features?: string[]
          id?: string
          monthly_price?: number
          name?: string
          popular?: boolean
          sort_order?: number
          updated_at?: string
          yearly_discount_percent?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          organization_id: string
          payment_link: string | null
          price: number
          product_url: string | null
          promotional_price: number | null
          stock_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          organization_id: string
          payment_link?: string | null
          price: number
          product_url?: string | null
          promotional_price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          organization_id?: string
          payment_link?: string | null
          price?: number
          product_url?: string | null
          promotional_price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          job_title: string | null
          phone: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          job_title?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          job_title?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          created_at: string
          id: string
          last_payment_at: string | null
          mp_preapproval_id: string | null
          next_billing_at: string | null
          organization_id: string
          plan_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          id?: string
          last_payment_at?: string | null
          mp_preapproval_id?: string | null
          next_billing_at?: string | null
          organization_id: string
          plan_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          id?: string
          last_payment_at?: string | null
          mp_preapproval_id?: string | null
          next_billing_at?: string | null
          organization_id?: string
          plan_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          app_id: string | null
          business_name: string | null
          connected_at: string | null
          created_at: string
          display_phone_number: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          organization_id: string
          phone_number_id: string
          status: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          app_id?: string | null
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id: string
          phone_number_id: string
          status?: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          app_id?: string | null
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone_number?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id?: string
          phone_number_id?: string
          status?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_status: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          external_message_id: string
          id: string
          message_id: string
          occurred_at: string
          organization_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_message_id: string
          id?: string
          message_id: string
          occurred_at: string
          organization_id: string
          status: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_message_id?: string
          id?: string
          message_id?: string
          occurred_at?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_status_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_tokens: {
        Row: {
          access_token: string
          account_id: string
          registration_pin: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          registration_pin?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          registration_pin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _organization_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id?: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "administrador" | "gerente" | "atendente"
      conversation_status: "aberta" | "aguardando_cliente" | "encerrada"
      lead_stage:
        | "novo"
        | "contato"
        | "interessado"
        | "qualificado"
        | "proposta"
        | "pagamento"
        | "cliente"
      message_sender: "cliente" | "ia" | "atendente"
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
      app_role: ["administrador", "gerente", "atendente"],
      conversation_status: ["aberta", "aguardando_cliente", "encerrada"],
      lead_stage: [
        "novo",
        "contato",
        "interessado",
        "qualificado",
        "proposta",
        "pagamento",
        "cliente",
      ],
      message_sender: ["cliente", "ia", "atendente"],
    },
  },
} as const
