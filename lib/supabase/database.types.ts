// Staging schema snapshot extended with the approved, unapplied venue-booking proposal.
// Regenerate from the complete isolated schema before deployment.
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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      training_register_completions: {
        Row: { event_id: string; completed_at: string | null; completed_by: string | null; attendance_version: number; present_count: number; player_count: number; card_count: number; updated_at: string }
        Insert: { event_id: string; completed_at?: string | null; completed_by?: string | null; attendance_version: number; present_count: number; player_count: number; card_count: number; updated_at?: string }
        Update: { event_id?: string; completed_at?: string | null; completed_by?: string | null; attendance_version?: number; present_count?: number; player_count?: number; card_count?: number; updated_at?: string }
        Relationships: [
          { foreignKeyName: "training_register_completions_event_id_fkey"; columns: ["event_id"]; isOneToOne: true; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "training_register_completions_completed_by_fkey"; columns: ["completed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }

      announcement_reads: {
        Row: {
          announcement_id: string
          profile_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          profile_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_targets: {
        Row: {
          age: number | null
          announcement_id: string
          coach_id: string | null
          created_at: string
          group_id: string | null
          id: string
          target_type: string
        }
        Insert: {
          age?: number | null
          announcement_id: string
          coach_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          target_type: string
        }
        Update: {
          age?: number | null
          announcement_id?: string
          coach_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_targets_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_targets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_targets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          require_acknowledgement: boolean
          starts_at: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          require_acknowledgement?: boolean
          starts_at?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          require_acknowledgement?: boolean
          starts_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          player_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          player_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          player_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          client_created_at: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          event_id: string
          id: string
          idempotency_key: string
          server_version: number
          updated_at: string
        }
        Insert: {
          client_created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          idempotency_key: string
          server_version?: number
          updated_at?: string
        }
        Update: {
          client_created_at?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          idempotency_key?: string
          server_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_group_assignments: {
        Row: {
          assignment_role: Database["public"]["Enums"]["assignment_role"]
          coach_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          is_active: boolean
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          assignment_role?: Database["public"]["Enums"]["assignment_role"]
          coach_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          assignment_role?: Database["public"]["Enums"]["assignment_role"]
          coach_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_group_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_group_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_group_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_metric_fields: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          label: string
          metric_id: string
          sort_order: number
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          metric_id: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metric_id?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_metric_fields_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_metric_fields_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_metric_fields_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_metrics: {
        Row: {
          age_from: number | null
          age_to: number | null
          created_at: string
          created_by: string | null
          default_unit: string | null
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["evaluation_metric_kind"]
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_from?: number | null
          age_to?: number | null
          created_at?: string
          created_by?: string | null
          default_unit?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["evaluation_metric_kind"]
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_from?: number | null
          age_to?: number | null
          created_at?: string
          created_by?: string | null
          default_unit?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["evaluation_metric_kind"]
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_metrics_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_materials: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string
          file_asset_id: string
          id: string
          source_type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id: string
          file_asset_id: string
          id?: string
          source_type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string
          file_asset_id?: string
          id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_materials_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_materials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_materials_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          coach_comment: string | null
          coach_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          group_id: string
          id: string
          idempotency_key: string
          is_rescheduled: boolean
          needs_substitute: boolean
          notes: string | null
          organizational_need: string | null
          original_start_at: string | null
          start_at: string
          status: string
          substitute_coach_id: string | null
          task_id: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          venue_id: string | null
          venue_part: string
          booking_venue_id: string | null
          booking_part: string
        }
        Insert: {
          coach_comment?: string | null
          coach_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          ends_at: string
          event_type: Database["public"]["Enums"]["event_type"]
          group_id: string
          id?: string
          idempotency_key?: string
          is_rescheduled?: boolean
          needs_substitute?: boolean
          notes?: string | null
          organizational_need?: string | null
          original_start_at?: string | null
          start_at: string
          status?: string
          substitute_coach_id?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
          venue_part?: string
          booking_venue_id?: string | null
          booking_part?: string
        }
        Update: {
          coach_comment?: string | null
          coach_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ends_at?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          group_id?: string
          id?: string
          idempotency_key?: string
          is_rescheduled?: boolean
          needs_substitute?: boolean
          notes?: string | null
          organizational_need?: string | null
          original_start_at?: string | null
          start_at?: string
          status?: string
          substitute_coach_id?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
          venue_part?: string
          booking_venue_id?: string | null
          booking_part?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_substitute_coach_id_fkey"
            columns: ["substitute_coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "methodology_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          export_type: string
          file_asset_id: string | null
          filters: Json
          id: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          export_type: string
          file_asset_id?: string | null
          filters?: Json
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          export_type?: string
          file_asset_id?: string | null
          filters?: Json
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      file_assets: {
        Row: {
          bucket: string
          checksum: string | null
          context_age: number | null
          context_group_id: string | null
          context_type: string
          created_at: string
          id: string
          mime_type: string
          object_path: string
          original_name: string
          owner_id: string
          scan_status: Database["public"]["Enums"]["file_scan_status"]
          size_bytes: number
        }
        Insert: {
          bucket: string
          checksum?: string | null
          context_age?: number | null
          context_group_id?: string | null
          context_type: string
          created_at?: string
          id?: string
          mime_type: string
          object_path: string
          original_name: string
          owner_id: string
          scan_status?: Database["public"]["Enums"]["file_scan_status"]
          size_bytes: number
        }
        Update: {
          bucket?: string
          checksum?: string | null
          context_age?: number | null
          context_group_id?: string | null
          context_type?: string
          created_at?: string
          id?: string
          mime_type?: string
          object_path?: string
          original_name?: string
          owner_id?: string
          scan_status?: Database["public"]["Enums"]["file_scan_status"]
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_assets_context_group_id_fkey"
            columns: ["context_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_activity_results: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metric_id: string
          metric_name: string
          period: string
          player_id: string
          source: string | null
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric_id: string
          metric_name: string
          period: string
          player_id: string
          source?: string | null
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric_id?: string
          metric_name?: string
          period?: string
          player_id?: string
          source?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_activity_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_activity_results_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_activity_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          age: number | null
          code: string
          competition_format: string | null
          created_at: string
          group_kind: string
          id: string
          is_active: boolean
          regulation_source: string | null
          regulation_verified_on: string | null
          season: string | null
          team_suffix: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          code: string
          competition_format?: string | null
          created_at?: string
          group_kind?: string
          id?: string
          is_active?: boolean
          regulation_source?: string | null
          regulation_verified_on?: string | null
          season?: string | null
          team_suffix?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          code?: string
          competition_format?: string | null
          created_at?: string
          group_kind?: string
          id?: string
          is_active?: boolean
          regulation_source?: string | null
          regulation_verified_on?: string | null
          season?: string | null
          team_suffix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guardians: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          player_id: string
          relation: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          player_id: string
          relation?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          player_id?: string
          relation?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          checksum: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          dataset: string
          error_rows: number
          file_asset_id: string | null
          id: string
          status: Database["public"]["Enums"]["job_status"]
          total_rows: number
          updated_at: string
          valid_rows: number
        }
        Insert: {
          checksum?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          dataset: string
          error_rows?: number
          file_asset_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Update: {
          checksum?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          dataset?: string
          error_rows?: number
          file_asset_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          errors: string[]
          id: number
          import_job_id: string
          is_valid: boolean
          payload: Json
          row_number: number
          warnings: string[]
        }
        Insert: {
          errors?: string[]
          id?: never
          import_job_id: string
          is_valid?: boolean
          payload: Json
          row_number: number
          warnings?: string[]
        }
        Update: {
          errors?: string[]
          id?: never
          import_job_id?: string
          is_valid?: boolean
          payload?: Json
          row_number?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          actor_id: string | null
          created_at: string
          field_name: string
          id: number
          item_id: string
          new_value: number
          old_value: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field_name: string
          id?: never
          item_id: string
          new_value: number
          old_value: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field_name?: string
          id?: never
          item_id?: string
          new_value?: number
          old_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          created_by: string | null
          damaged: number
          group_id: string
          id: string
          is_active: boolean
          lost: number
          name: string
          needed: number
          quantity: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          damaged?: number
          group_id: string
          id?: string
          is_active?: boolean
          lost?: number
          name: string
          needed?: number
          quantity?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          damaged?: number
          group_id?: string
          id?: string
          is_active?: boolean
          lost?: number
          name?: string
          needed?: number
          quantity?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_permissions: {
        Row: {
          can_edit_quantity: boolean
          can_report_issues: boolean
          coach_id: string
          group_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          can_edit_quantity?: boolean
          can_report_issues?: boolean
          coach_id: string
          group_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          can_edit_quantity?: boolean
          can_report_issues?: boolean
          coach_id?: string
          group_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_permissions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_materials: {
        Row: {
          added_by: string | null
          age_from: number
          age_to: number
          created_at: string
          file_asset_id: string
          id: string
          task_id: string
        }
        Insert: {
          added_by?: string | null
          age_from: number
          age_to: number
          created_at?: string
          file_asset_id: string
          id?: string
          task_id: string
        }
        Update: {
          added_by?: string | null
          age_from?: number
          age_to?: number
          created_at?: string
          file_asset_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "methodology_materials_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_materials_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "methodology_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_section_materials: {
        Row: {
          added_by: string | null
          created_at: string
          description: string | null
          file_asset_id: string
          id: string
          is_active: boolean
          section_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          file_asset_id: string
          id?: string
          is_active?: boolean
          section_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          file_asset_id?: string
          id?: string
          is_active?: boolean
          section_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "methodology_section_materials_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_section_materials_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_section_materials_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "methodology_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_sections: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "methodology_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_tasks: {
        Row: {
          age_from: number
          age_to: number
          component: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["methodology_level"]
          phase: Database["public"]["Enums"]["methodology_phase"]
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_from: number
          age_to: number
          component?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level: Database["public"]["Enums"]["methodology_level"]
          phase: Database["public"]["Enums"]["methodology_phase"]
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_from?: number
          age_to?: number
          component?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["methodology_level"]
          phase?: Database["public"]["Enums"]["methodology_phase"]
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "methodology_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_payments: {
        Row: {
          changed_at: string
          changed_by: string
          created_at: string
          id: string
          month: string
          player_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          changed_at?: string
          changed_by: string
          created_at?: string
          id?: string
          month: string
          player_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string
          created_at?: string
          id?: string
          month?: string
          player_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "monthly_payments_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_payments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_star_awards: {
        Row: {
          award_type: Database["public"]["Enums"]["monthly_star_award_type"]
          correction_note: string | null
          created_at: string
          group_id: string
          id: string
          month: string
          player_id: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          selected_by: string | null
          theme_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          award_type: Database["public"]["Enums"]["monthly_star_award_type"]
          correction_note?: string | null
          created_at?: string
          group_id: string
          id?: string
          month: string
          player_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          selected_by?: string | null
          theme_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          award_type?: Database["public"]["Enums"]["monthly_star_award_type"]
          correction_note?: string | null
          created_at?: string
          group_id?: string
          id?: string
          month?: string
          player_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          selected_by?: string | null
          theme_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_star_awards_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_awards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_awards_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_awards_selected_by_fkey"
            columns: ["selected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_awards_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "monthly_star_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_awards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_star_themes: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: string | null
          description: string
          id: string
          month: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: string | null
          description: string
          id?: string
          month: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: string | null
          description?: string
          id?: string
          month?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_star_themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_star_themes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_items: {
        Row: {
          assigned_to: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          due_at: string | null
          event_id: string | null
          group_id: string
          id: string
          item_type: Database["public"]["Enums"]["operational_type"]
          status: Database["public"]["Enums"]["operational_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          due_at?: string | null
          event_id?: string | null
          group_id: string
          id?: string
          item_type: Database["public"]["Enums"]["operational_type"]
          status?: Database["public"]["Enums"]["operational_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          due_at?: string | null
          event_id?: string | null
          group_id?: string
          id?: string
          item_type?: Database["public"]["Enums"]["operational_type"]
          status?: Database["public"]["Enums"]["operational_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_contact_actions: {
        Row: {
          coach_id: string | null
          coach_name_snapshot: string
          comment: string | null
          contacted_at: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          month: string
          player_id: string
        }
        Insert: {
          coach_id?: string | null
          coach_name_snapshot: string
          comment?: string | null
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          month: string
          player_id: string
        }
        Update: {
          coach_id?: string | null
          coach_name_snapshot?: string
          comment?: string | null
          contacted_at?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          month?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_contact_actions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_contact_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_contact_actions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_contact_actions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_test_results: {
        Row: {
          created_at: string
          created_by: string | null
          field_id: string
          field_name: string
          id: string
          measured_on: string
          metric_id: string
          metric_name: string
          player_id: string
          session_id: string | null
          source: string | null
          unit: string | null
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_id: string
          field_name: string
          id?: string
          measured_on: string
          metric_id: string
          metric_name: string
          player_id: string
          session_id?: string | null
          source?: string | null
          unit?: string | null
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_id?: string
          field_name?: string
          id?: string
          measured_on?: string
          metric_id?: string
          metric_name?: string
          player_id?: string
          session_id?: string | null
          source?: string | null
          unit?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "physical_test_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_results_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metric_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_results_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "physical_test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_test_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          footwear: string | null
          group_id: string
          id: string
          import_job_id: string | null
          measured_on: string
          notes: string | null
          source: string | null
          started_at: string | null
          surface: string | null
          temperature_c: number | null
          updated_at: string
          updated_by: string | null
          venue_name: string | null
          weather: string | null
          wind: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          footwear?: string | null
          group_id: string
          id?: string
          import_job_id?: string | null
          measured_on: string
          notes?: string | null
          source?: string | null
          started_at?: string | null
          surface?: string | null
          temperature_c?: number | null
          updated_at?: string
          updated_by?: string | null
          venue_name?: string | null
          weather?: string | null
          wind?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          footwear?: string | null
          group_id?: string
          id?: string
          import_job_id?: string | null
          measured_on?: string
          notes?: string | null
          source?: string | null
          started_at?: string | null
          surface?: string | null
          temperature_c?: number | null
          updated_at?: string
          updated_by?: string | null
          venue_name?: string | null
          weather?: string | null
          wind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_test_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_sessions_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_test_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_behavior_cards: {
        Row: {
          coach_id: string | null
          coach_name_snapshot: string
          comment: string | null
          created_at: string
          event_id: string | null
          group_id: string
          id: string
          is_voided: boolean
          month: string | null
          occurred_on: string
          player_id: string
          reason: Database["public"]["Enums"]["behavior_card_reason"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          coach_id?: string | null
          coach_name_snapshot: string
          comment?: string | null
          created_at?: string
          event_id?: string | null
          group_id: string
          id?: string
          is_voided?: boolean
          month?: string | null
          occurred_on?: string
          player_id: string
          reason: Database["public"]["Enums"]["behavior_card_reason"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          coach_id?: string | null
          coach_name_snapshot?: string
          comment?: string | null
          created_at?: string
          event_id?: string | null
          group_id?: string
          id?: string
          is_voided?: boolean
          month?: string | null
          occurred_on?: string
          player_id?: string
          reason?: Database["public"]["Enums"]["behavior_card_reason"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_behavior_cards_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_behavior_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_behavior_cards_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_behavior_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_behavior_cards_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_photos: {
        Row: {
          created_at: string
          file_asset_id: string
          id: string
          is_current: boolean
          player_id: string
        }
        Insert: {
          created_at?: string
          file_asset_id: string
          id?: string
          is_current?: boolean
          player_id: string
        }
        Update: {
          created_at?: string
          file_asset_id?: string
          id?: string
          is_current?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_photos_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_photos_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active_from: string
          active_to: string | null
          birth_date: string | null
          birth_year: number | null
          coach_note: string | null
          coach_note_author_id: string | null
          coach_note_author_name: string | null
          coach_note_updated_at: string | null
          created_at: string
          created_by: string | null
          dominant_foot: string | null
          external_key: string | null
          first_name: string | null
          full_name: string
          group_id: string
          id: string
          is_active: boolean
          last_name: string | null
          middle_name: string | null
          position: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_from?: string
          active_to?: string | null
          birth_date?: string | null
          birth_year?: number | null
          coach_note?: string | null
          coach_note_author_id?: string | null
          coach_note_author_name?: string | null
          coach_note_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          dominant_foot?: string | null
          external_key?: string | null
          first_name?: string | null
          full_name: string
          group_id: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          position?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_from?: string
          active_to?: string | null
          birth_date?: string | null
          birth_year?: number | null
          coach_note?: string | null
          coach_note_author_id?: string | null
          coach_note_author_name?: string | null
          coach_note_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          dominant_foot?: string | null
          external_key?: string | null
          first_name?: string | null
          full_name?: string
          group_id?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          position?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_coach_note_author_id_fkey"
            columns: ["coach_note_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          middle_name: string | null
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          id: string
          last_name?: string | null
          middle_name?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          middle_name?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      terminology_entries: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          definition: string
          id: string
          is_active: boolean
          source: string | null
          term: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          definition: string
          id?: string
          is_active?: boolean
          source?: string | null
          term: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          definition?: string
          id?: string
          is_active?: boolean
          source?: string | null
          term?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminology_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminology_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_structure_steps: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          position: number
          structure_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          position: number
          structure_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          position?: number
          structure_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_structure_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_structure_steps_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "training_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_structure_steps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_structures: {
        Row: {
          age_from: number
          age_to: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_from: number
          age_to: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_from?: number
          age_to?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_structures_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_catalog_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sizes: string[]
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sizes?: string[]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sizes?: string[]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uniform_catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_catalog_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_request_items: {
        Row: {
          actor_id: string | null
          catalog_item_id: string
          created_at: string
          id: string
          quantity: number
          request_id: string
          size: string
        }
        Insert: {
          actor_id?: string | null
          catalog_item_id: string
          created_at?: string
          id?: string
          quantity?: number
          request_id: string
          size: string
        }
        Update: {
          actor_id?: string | null
          catalog_item_id?: string
          created_at?: string
          id?: string
          quantity?: number
          request_id?: string
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_request_items_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_request_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "uniform_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "uniform_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          number: number | null
          player_id: string
          requested_by: string | null
          status: Database["public"]["Enums"]["uniform_status"]
          surname_print: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          number?: number | null
          player_id: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["uniform_status"]
          surname_print?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          number?: number | null
          player_id?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["uniform_status"]
          surname_print?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uniform_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
          venue_type: string
          supports_half_booking: boolean
          parent_venue_id: string | null
          venue_part: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          venue_type?: string
          supports_half_booking?: boolean
          parent_venue_id?: string | null
          venue_part?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          venue_type?: string
          supports_half_booking?: boolean
          parent_venue_id?: string | null
          venue_part?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_parent_venue_id_fkey"
            columns: ["parent_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      task_usage: {
        Row: {
          group_id: string | null
          last_used_at: string | null
          task_id: string | null
          usage_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "methodology_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      complete_training_register: {
        Args: { p_event_id: string; p_expected_attendance_version: number; p_expected_card_ids: string[]; p_expected_records: Json }
        Returns: Json
      }
      venue_booking_conflicts: {
        Args: { p_venue_id: string; p_start_at: string; p_duration_minutes: number; p_exclude_event_id?: string | null }
        Returns: { venue_part: string; start_at: string; ends_at: string; group_code: string | null }[]
      }
      admin_assign_groups: {
        Args: { p_coach_id: string; p_group_ids: string[] }
        Returns: undefined
      }
      attach_event_material: {
        Args: { p_event_id: string; p_file_asset_id: string }
        Returns: undefined
      }
      attach_event_task_material: {
        Args: { p_event_id: string; p_file_asset_id: string; p_task_id: string }
        Returns: undefined
      }
      complete_password_change: { Args: never; Returns: undefined }
      confirm_import_job: { Args: { p_job_id: string }; Returns: number }
      finalize_coach_deletion: {
        Args: { p_admin_id: string; p_coach_id: string; p_reason?: string }
        Returns: Json
      }
      move_methodology_task: {
        Args: { p_direction: number; p_task_id: string }
        Returns: undefined
      }
      move_training_step: {
        Args: { p_direction: number; p_step_id: string }
        Returns: undefined
      }
      save_attendance: {
        Args: {
          p_client_created_at: string
          p_event_id: string
          p_idempotency_key: string
          p_records: Json
        }
        Returns: string
      }
      save_monthly_star_awards: {
        Args: {
          p_coach_choice: string
          p_correction_note?: string
          p_group_id: string
          p_month: string
          p_team_choice: string
          p_theme_id: string
        }
        Returns: undefined
      }
      save_physical_evaluation_metric: {
        Args: {
          p_age_from: number
          p_age_to: number
          p_description: string
          p_fields: Json
          p_metric_id: string
          p_name: string
        }
        Returns: string
      }
      save_player_coach_note: {
        Args: { p_note: string; p_player_id: string }
        Returns: string
      }
      set_player_photo: {
        Args: { p_file_asset_id: string; p_player_id: string }
        Returns: string
      }
      save_uniform_request: {
        Args: {
          p_items: Json
          p_number: number
          p_player_id: string
          p_surname_print: string
        }
        Returns: string
      }
      void_behavior_card: {
        Args: { p_card_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "coach" | "admin"
      assignment_role: "lead" | "assistant"
      attendance_status: "present" | "absent"
      behavior_card_reason:
        | "late"
        | "discipline_violation"
        | "coach_noncompliance"
        | "safety"
        | "unsporting_behavior"
        | "disrespect"
        | "other"
      evaluation_metric_kind: "physical_preparedness" | "game_activity"
      event_type: "training" | "oblast" | "ukraine" | "tournament" | "theory"
      file_scan_status: "pending" | "clean" | "rejected"
      job_status:
        | "uploaded"
        | "previewed"
        | "confirmed"
        | "failed"
        | "cancelled"
        | "completed"
      methodology_level: "individual" | "group" | "team"
      methodology_phase: "attack" | "defence"
      monthly_star_award_type: "coach_choice" | "team_choice"
      operational_status: "todo" | "in_progress" | "done"
      operational_type:
        | "conflict"
        | "organizational_need"
        | "coach_substitution"
        | "reschedule"
        | "comment"
      payment_status: "paid" | "unpaid"
      profile_status: "invited" | "active" | "suspended" | "closed"
      uniform_status: "not_ordered" | "requested" | "preparing" | "issued"
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
      app_role: ["coach", "admin"],
      assignment_role: ["lead", "assistant"],
      attendance_status: ["present", "absent"],
      behavior_card_reason: [
        "late",
        "discipline_violation",
        "coach_noncompliance",
        "safety",
        "unsporting_behavior",
        "disrespect",
        "other",
      ],
      evaluation_metric_kind: ["physical_preparedness", "game_activity"],
      event_type: ["training", "oblast", "ukraine", "tournament", "theory"],
      file_scan_status: ["pending", "clean", "rejected"],
      job_status: [
        "uploaded",
        "previewed",
        "confirmed",
        "failed",
        "cancelled",
        "completed",
      ],
      methodology_level: ["individual", "group", "team"],
      methodology_phase: ["attack", "defence"],
      monthly_star_award_type: ["coach_choice", "team_choice"],
      operational_status: ["todo", "in_progress", "done"],
      operational_type: [
        "conflict",
        "organizational_need",
        "coach_substitution",
        "reschedule",
        "comment",
      ],
      payment_status: ["paid", "unpaid"],
      profile_status: ["invited", "active", "suspended", "closed"],
      uniform_status: ["not_ordered", "requested", "preparing", "issued"],
    },
  },
} as const
