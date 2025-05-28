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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          email_interaction_id: string | null
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          email_interaction_id?: string | null
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          email_interaction_id?: string | null
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_email_interaction_id_fkey"
            columns: ["email_interaction_id"]
            isOneToOne: false
            referencedRelation: "email_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_interactions: {
        Row: {
          created_at: string
          from_email: string
          id: string
          intent: string | null
          knowreply_agent_used: string | null
          knowreply_intent: string | null
          knowreply_mcp_results: Json | null
          knowreply_request: Json | null
          knowreply_response: Json | null
          mcp_result: Json | null
          mcp_used: string | null
          message_id: string
          original_content: string | null
          postmark_request: Json | null
          postmark_response: Json | null
          reply_content: string | null
          status: string | null
          subject: string | null
          to_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_email: string
          id?: string
          intent?: string | null
          knowreply_agent_used?: string | null
          knowreply_intent?: string | null
          knowreply_mcp_results?: Json | null
          knowreply_request?: Json | null
          knowreply_response?: Json | null
          mcp_result?: Json | null
          mcp_used?: string | null
          message_id: string
          original_content?: string | null
          postmark_request?: Json | null
          postmark_response?: Json | null
          reply_content?: string | null
          status?: string | null
          subject?: string | null
          to_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_email?: string
          id?: string
          intent?: string | null
          knowreply_agent_used?: string | null
          knowreply_intent?: string | null
          knowreply_mcp_results?: Json | null
          knowreply_request?: Json | null
          knowreply_response?: Json | null
          mcp_result?: Json | null
          mcp_used?: string | null
          message_id?: string
          original_content?: string | null
          postmark_request?: Json | null
          postmark_response?: Json | null
          reply_content?: string | null
          status?: string | null
          subject?: string | null
          to_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_test_cases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          incoming_json: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          incoming_json: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          incoming_json?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_test_runs: {
        Row: {
          error_message: string | null
          executed_at: string
          id: string
          response_data: Json | null
          success: boolean
          test_case_id: string
          user_id: string
        }
        Insert: {
          error_message?: string | null
          executed_at?: string
          id?: string
          response_data?: Json | null
          success: boolean
          test_case_id: string
          user_id: string
        }
        Update: {
          error_message?: string | null
          executed_at?: string
          id?: string
          response_data?: Json | null
          success?: boolean
          test_case_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_test_runs_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "email_test_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      knowreply_agent_mcp_mappings: {
        Row: {
          active: boolean | null
          agent_id: string
          created_at: string
          id: string
          mcp_endpoint_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          agent_id: string
          created_at?: string
          id?: string
          mcp_endpoint_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          agent_id?: string
          created_at?: string
          id?: string
          mcp_endpoint_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowreply_agent_mcp_mappings_mcp_endpoint_id_fkey"
            columns: ["mcp_endpoint_id"]
            isOneToOne: false
            referencedRelation: "mcp_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_endpoints: {
        Row: {
          active: boolean | null
          auth_token: string | null
          category: string
          created_at: string
          expected_format: Json | null
          id: string
          instructions: string | null
          name: string
          post_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          auth_token?: string | null
          category: string
          created_at?: string
          expected_format?: Json | null
          id?: string
          instructions?: string | null
          name: string
          post_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          auth_token?: string | null
          category?: string
          created_at?: string
          expected_format?: Json | null
          id?: string
          instructions?: string | null
          name?: string
          post_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      postmark_inbound_emails: {
        Row: {
          attachments: Json | null
          bcc_email: string | null
          cc_email: string | null
          created_at: string
          from_email: string
          from_name: string | null
          headers: Json | null
          html_body: string | null
          id: string
          mailbox_hash: string | null
          message_id: string
          processed: boolean | null
          raw_webhook_data: Json
          spam_score: number | null
          spam_status: string | null
          stripped_text_reply: string | null
          subject: string | null
          text_body: string | null
          to_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          bcc_email?: string | null
          cc_email?: string | null
          created_at?: string
          from_email: string
          from_name?: string | null
          headers?: Json | null
          html_body?: string | null
          id?: string
          mailbox_hash?: string | null
          message_id: string
          processed?: boolean | null
          raw_webhook_data: Json
          spam_score?: number | null
          spam_status?: string | null
          stripped_text_reply?: string | null
          subject?: string | null
          text_body?: string | null
          to_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          bcc_email?: string | null
          cc_email?: string | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          headers?: Json | null
          html_body?: string | null
          id?: string
          mailbox_hash?: string | null
          message_id?: string
          processed?: boolean | null
          raw_webhook_data?: Json
          spam_score?: number | null
          spam_status?: string | null
          stripped_text_reply?: string | null
          subject?: string | null
          text_body?: string | null
          to_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          updated_at?: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
          workspace_name?: string | null
        }
        Relationships: []
      }
      workspace_configs: {
        Row: {
          created_at: string
          id: string
          knowreply_agent_id: string | null
          knowreply_api_token: string | null
          knowreply_base_url: string | null
          knowreply_persona: string | null
          knowreply_webhook_url: string | null
          postmark_active: boolean | null
          postmark_api_token: string | null
          postmark_inbound_hash: string | null
          postmark_server_id: string | null
          postmark_webhook_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          knowreply_agent_id?: string | null
          knowreply_api_token?: string | null
          knowreply_base_url?: string | null
          knowreply_persona?: string | null
          knowreply_webhook_url?: string | null
          postmark_active?: boolean | null
          postmark_api_token?: string | null
          postmark_inbound_hash?: string | null
          postmark_server_id?: string | null
          postmark_webhook_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          knowreply_agent_id?: string | null
          knowreply_api_token?: string | null
          knowreply_base_url?: string | null
          knowreply_persona?: string | null
          knowreply_webhook_url?: string | null
          postmark_active?: boolean | null
          postmark_api_token?: string | null
          postmark_inbound_hash?: string | null
          postmark_server_id?: string | null
          postmark_webhook_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
