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
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          ip: string | null
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip?: string | null
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          ip?: string | null
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      batteries: {
        Row: {
          capacity_mah: number | null
          charge_level: number
          created_at: string
          id: string
          is_simulated: boolean
          last_seen_at: string | null
          machine_id: string | null
          serial: string
          slot_number: number | null
          status: Database["public"]["Enums"]["battery_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity_mah?: number | null
          charge_level?: number
          created_at?: string
          id?: string
          is_simulated?: boolean
          last_seen_at?: string | null
          machine_id?: string | null
          serial: string
          slot_number?: number | null
          status?: Database["public"]["Enums"]["battery_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity_mah?: number | null
          charge_level?: number
          created_at?: string
          id?: string
          is_simulated?: boolean
          last_seen_at?: string | null
          machine_id?: string | null
          serial?: string
          slot_number?: number | null
          status?: Database["public"]["Enums"]["battery_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batteries_machine_id_tenant_id_fkey"
            columns: ["machine_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "batteries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          accent_color: string
          checkout_headline: string | null
          display_name: string
          logo_path: string | null
          portal_message: string | null
          primary_color: string
          return_instructions: string | null
          secondary_color: string
          support_email: string | null
          support_phone: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          accent_color?: string
          checkout_headline?: string | null
          display_name: string
          logo_path?: string | null
          portal_message?: string | null
          primary_color?: string
          return_instructions?: string | null
          secondary_color?: string
          support_email?: string | null
          support_phone?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          accent_color?: string
          checkout_headline?: string | null
          display_name?: string
          logo_path?: string | null
          portal_message?: string | null
          primary_color?: string
          return_instructions?: string | null
          secondary_color?: string
          support_email?: string | null
          support_phone?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount_cents: number
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          location_id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          revenue_cents: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          commission_type: string
          commission_value?: number
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          revenue_cents?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          revenue_cents?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_location_id_tenant_id_fkey"
            columns: ["location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          rental_count: number
          stripe_customer_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rental_count?: number
          stripe_customer_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rental_count?: number
          stripe_customer_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_events: {
        Row: {
          created_at: string
          event_type: string
          external_id: string | null
          id: number
          is_simulated: boolean
          machine_id: string | null
          occurred_at: string
          payload: Json
          rental_id: string | null
          severity: string
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          external_id?: string | null
          id?: never
          is_simulated?: boolean
          machine_id?: string | null
          occurred_at?: string
          payload?: Json
          rental_id?: string | null
          severity?: string
          source: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          external_id?: string | null
          id?: never
          is_simulated?: boolean
          machine_id?: string | null
          occurred_at?: string
          payload?: Json
          rental_id?: string | null
          severity?: string
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_events_machine_id_tenant_id_fkey"
            columns: ["machine_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "device_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          credentials_encrypted: string | null
          details: Json
          id: string
          kind: string
          last_synced_at: string | null
          livemode: boolean | null
          provider: string
          status: string
          stripe_account_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_encrypted?: string | null
          details?: Json
          id?: string
          kind: string
          last_synced_at?: string | null
          livemode?: boolean | null
          provider: string
          status?: string
          stripe_account_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string | null
          details?: Json
          id?: string
          kind?: string
          last_synced_at?: string | null
          livemode?: boolean | null
          provider?: string
          status?: string
          stripe_account_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          commission_type: string
          commission_value: number
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          postal_code: string | null
          region: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          commission_type?: string
          commission_value?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          postal_code?: string | null
          region?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          commission_type?: string
          commission_value?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          postal_code?: string | null
          region?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          available_batteries: number
          connection_status: Database["public"]["Enums"]["machine_connection"]
          created_at: string
          device_id: string
          id: string
          is_simulated: boolean
          last_seen_at: string | null
          location_id: string | null
          manufacturer: string
          model: string | null
          name: string | null
          notes: string | null
          provider: string
          public_code: string
          sim_config: Json
          state: Database["public"]["Enums"]["machine_state"]
          tenant_id: string
          total_slots: number
          updated_at: string
        }
        Insert: {
          available_batteries?: number
          connection_status?: Database["public"]["Enums"]["machine_connection"]
          created_at?: string
          device_id: string
          id?: string
          is_simulated?: boolean
          last_seen_at?: string | null
          location_id?: string | null
          manufacturer?: string
          model?: string | null
          name?: string | null
          notes?: string | null
          provider?: string
          public_code?: string
          sim_config?: Json
          state?: Database["public"]["Enums"]["machine_state"]
          tenant_id: string
          total_slots?: number
          updated_at?: string
        }
        Update: {
          available_batteries?: number
          connection_status?: Database["public"]["Enums"]["machine_connection"]
          created_at?: string
          device_id?: string
          id?: string
          is_simulated?: boolean
          last_seen_at?: string | null
          location_id?: string | null
          manufacturer?: string
          model?: string | null
          name?: string | null
          notes?: string | null
          provider?: string
          public_code?: string
          sim_config?: Json
          state?: Database["public"]["Enums"]["machine_state"]
          tenant_id?: string
          total_slots?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_location_id_tenant_id_fkey"
            columns: ["location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "machines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_authorized_cents: number
          amount_captured_cents: number
          amount_refunded_cents: number
          application_fee_cents: number
          created_at: string
          currency: string
          customer_id: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          is_simulated: boolean
          livemode: boolean
          provider: string
          rental_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_account_id: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_authorized_cents?: number
          amount_captured_cents?: number
          amount_refunded_cents?: number
          application_fee_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          is_simulated?: boolean
          livemode?: boolean
          provider?: string
          rental_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_account_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_authorized_cents?: number
          amount_captured_cents?: number
          amount_refunded_cents?: number
          application_fee_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          is_simulated?: boolean
          livemode?: boolean
          provider?: string
          rental_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_account_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_tenant_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "payments_rental_id_tenant_id_fkey"
            columns: ["rental_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_public: boolean
          location_limit: number | null
          machine_limit: number
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          team_limit: number | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          location_limit?: number | null
          machine_limit: number
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          team_limit?: number | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          location_limit?: number | null
          machine_limit?: number
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          team_limit?: number | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string | null
          is_simulated: boolean
          payment_id: string
          reason: string | null
          rental_id: string | null
          status: string
          stripe_refund_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string | null
          is_simulated?: boolean
          payment_id: string
          reason?: string | null
          rental_id?: string | null
          status?: string
          stripe_refund_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string | null
          is_simulated?: boolean
          payment_id?: string
          reason?: string | null
          rental_id?: string | null
          status?: string
          stripe_refund_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_tenant_id_fkey"
            columns: ["payment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "refunds_rental_id_tenant_id_fkey"
            columns: ["rental_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_pricing: {
        Row: {
          currency: string
          daily_rate_cents: number
          free_minutes: number
          hourly_rate_cents: number
          initial_fee_cents: number
          late_after_hours: number | null
          late_fee_cents: number
          max_charge_cents: number
          overdue_after_hours: number
          refund_policy: string | null
          refund_window_days: number
          tenant_id: string
          terms_text: string | null
          updated_at: string
        }
        Insert: {
          currency?: string
          daily_rate_cents?: number
          free_minutes?: number
          hourly_rate_cents?: number
          initial_fee_cents?: number
          late_after_hours?: number | null
          late_fee_cents?: number
          max_charge_cents?: number
          overdue_after_hours?: number
          refund_policy?: string | null
          refund_window_days?: number
          tenant_id: string
          terms_text?: string | null
          updated_at?: string
        }
        Update: {
          currency?: string
          daily_rate_cents?: number
          free_minutes?: number
          hourly_rate_cents?: number
          initial_fee_cents?: number
          late_after_hours?: number | null
          late_fee_cents?: number
          max_charge_cents?: number
          overdue_after_hours?: number
          refund_policy?: string | null
          refund_window_days?: number
          tenant_id?: string
          terms_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          amount_cents: number
          authorized_cents: number
          battery_id: string | null
          battery_serial: string | null
          closed_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_locale: string | null
          failure_reason: string | null
          id: string
          is_simulated: boolean
          location_id: string | null
          machine_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pricing_snapshot: Json
          provider_rental_ref: string | null
          public_token: string
          refund_status: Database["public"]["Enums"]["refund_state"]
          refunded_cents: number
          return_machine_id: string | null
          returned_at: string | null
          revenue_at: string | null
          slot_number: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["rental_status"]
          stripe_account_id: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          terms_accepted_at: string | null
          unlock_attempts: number
          unlock_confirmed_at: string | null
          unlock_requested_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          authorized_cents?: number
          battery_id?: string | null
          battery_serial?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_locale?: string | null
          failure_reason?: string | null
          id?: string
          is_simulated?: boolean
          location_id?: string | null
          machine_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pricing_snapshot: Json
          provider_rental_ref?: string | null
          public_token?: string
          refund_status?: Database["public"]["Enums"]["refund_state"]
          refunded_cents?: number
          return_machine_id?: string | null
          returned_at?: string | null
          revenue_at?: string | null
          slot_number?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          stripe_account_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          terms_accepted_at?: string | null
          unlock_attempts?: number
          unlock_confirmed_at?: string | null
          unlock_requested_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          authorized_cents?: number
          battery_id?: string | null
          battery_serial?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_locale?: string | null
          failure_reason?: string | null
          id?: string
          is_simulated?: boolean
          location_id?: string | null
          machine_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pricing_snapshot?: Json
          provider_rental_ref?: string | null
          public_token?: string
          refund_status?: Database["public"]["Enums"]["refund_state"]
          refunded_cents?: number
          return_machine_id?: string | null
          returned_at?: string | null
          revenue_at?: string | null
          slot_number?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          stripe_account_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          terms_accepted_at?: string | null
          unlock_attempts?: number
          unlock_confirmed_at?: string | null
          unlock_requested_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_battery_id_tenant_id_fkey"
            columns: ["battery_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "batteries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "rentals_customer_id_tenant_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "rentals_location_id_tenant_id_fkey"
            columns: ["location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "rentals_machine_id_tenant_id_fkey"
            columns: ["machine_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "rentals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          key: string
          name: string
          permissions: string[]
          rank: number
        }
        Insert: {
          description?: string | null
          key: string
          name: string
          permissions?: string[]
          rank: number
        }
        Update: {
          description?: string | null
          key?: string
          name?: string
          permissions?: string[]
          rank?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          last_payment_error: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_payment_error?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_payment_error?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          replied_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_reply?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          replied_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_reply?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          replied_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          kind: string
          tenant_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          kind: string
          tenant_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          kind?: string
          tenant_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          default_currency: string
          id: string
          locale: string
          name: string
          plan_id: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          suspended_at: string | null
          suspended_reason: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          locale?: string
          name: string
          plan_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          id?: string
          locale?: string
          name?: string
          plan_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          account_id: string | null
          attempts: number
          event_type: string
          external_id: string
          id: string
          last_error: string | null
          livemode: boolean | null
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          event_type: string
          external_id: string
          id?: string
          last_error?: string | null
          livemode?: boolean | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          source: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          account_id?: string | null
          attempts?: number
          event_type?: string
          external_id?: string
          id?: string
          last_error?: string | null
          livemode?: boolean | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      analytics_location_performance: {
        Args: {
          p_data?: string
          p_from: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          avg_revenue_cents: number
          commission_due_cents: number
          commission_type: string
          commission_value: number
          location_id: string
          location_name: string
          machines: number
          rentals: number
          revenue_cents: number
        }[]
      }
      analytics_machine_performance: {
        Args: {
          p_data?: string
          p_from: string
          p_tenant: string
          p_to: string
        }
        Returns: {
          device_id: string
          is_simulated: boolean
          location_name: string
          machine_id: string
          machine_name: string
          offline_minutes: number
          rental_minutes: number
          rentals: number
          revenue_cents: number
          utilization_pct: number
        }[]
      }
      analytics_revenue_series: {
        Args: {
          p_bucket?: string
          p_data?: string
          p_from: string
          p_tenant: string
          p_to: string
          p_tz?: string
        }
        Returns: {
          bucket_start: string
          refunds_cents: number
          rentals: number
          revenue_cents: number
        }[]
      }
      analytics_summary: {
        Args: {
          p_data?: string
          p_from: string
          p_tenant: string
          p_to: string
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      create_my_tenant: {
        Args: { p_name: string; p_plan_code?: string; p_slug: string }
        Returns: string
      }
      data_filter_match: {
        Args: { p_data: string; p_is_simulated: boolean }
        Returns: boolean
      }
      integration_link_stripe: {
        Args: { p_account: string; p_livemode: boolean; p_tenant: string }
        Returns: undefined
      }
      integration_stripe_deauthorized: {
        Args: { p_account: string }
        Returns: string
      }
      integration_sync_stripe: {
        Args: {
          p_account: string
          p_details: Json
          p_livemode: boolean
          p_status: string
        }
        Returns: string
      }
      is_super_admin: { Args: never; Returns: boolean }
      log_device_event: {
        Args: {
          p_external_id?: string
          p_machine: string
          p_occurred_at?: string
          p_payload?: Json
          p_rental: string
          p_severity?: string
          p_simulated?: boolean
          p_source: string
          p_tenant: string
          p_type: string
        }
        Returns: number
      }
      machine_by_device: {
        Args: { p_device_id: string; p_provider: string }
        Returns: Json
      }
      machine_recount: { Args: { p_machine: string }; Returns: undefined }
      machine_set_connection: {
        Args: {
          p_external_id?: string
          p_machine: string
          p_source: string
          p_status: Database["public"]["Enums"]["machine_connection"]
        }
        Returns: undefined
      }
      member_role: { Args: { tid: string }; Returns: string }
      my_tenant_ids: { Args: { min_role?: string }; Returns: string[] }
      my_writable_tenant_ids: { Args: { min_role?: string }; Returns: string[] }
      platform_stats: { Args: never; Returns: Json }
      provision_tenant: {
        Args: {
          p_locale?: string
          p_name: string
          p_owner: string
          p_plan_code: string
          p_slug: string
        }
        Returns: string
      }
      public_machine_info: { Args: { p_code: string }; Returns: Json }
      refund_apply: {
        Args: {
          p_actor: string
          p_amount: number
          p_idempotency: string
          p_payment: string
          p_reason: string
          p_simulated: boolean
          p_status: string
          p_stripe_refund: string
        }
        Returns: Json
      }
      refund_recalculate: { Args: { p_payment: string }; Returns: undefined }
      refund_update_by_stripe_id: {
        Args: { p_status: string; p_stripe_refund: string }
        Returns: undefined
      }
      rental_attach_checkout: {
        Args: { p_rental: string; p_session_id: string }
        Returns: undefined
      }
      rental_battery_returned: {
        Args: {
          p_battery_serial: string
          p_charge_level?: number
          p_external_id?: string
          p_return_machine: string
          p_returned_at: string
          p_slot: number
          p_source: string
          p_tenant: string
        }
        Returns: Json
      }
      rental_by_provider_ref: {
        Args: { p_ref: string; p_tenant: string }
        Returns: string
      }
      rental_cancel: {
        Args: { p_reason: string; p_rental: string }
        Returns: Json
      }
      rental_checkout_expired: { Args: { p_rental: string }; Returns: boolean }
      rental_claim_unlock: {
        Args: { p_max_attempts?: number; p_rental: string }
        Returns: Json
      }
      rental_context: { Args: { p_rental: string }; Returns: Json }
      rental_expire_pending: { Args: { p_minutes?: number }; Returns: string[] }
      rental_mark_overdue: { Args: never; Returns: string[] }
      rental_payment_authorized: {
        Args: {
          p_amount: number
          p_charge?: string
          p_currency: string
          p_customer_email?: string
          p_livemode: boolean
          p_payment_intent: string
          p_provider: string
          p_rental: string
          p_stripe_customer?: string
        }
        Returns: Json
      }
      rental_payment_captured: {
        Args: {
          p_amount: number
          p_application_fee?: number
          p_charge?: string
          p_rental: string
        }
        Returns: Json
      }
      rental_payment_failed: {
        Args: { p_code: string; p_message: string; p_rental: string }
        Returns: undefined
      }
      rental_payment_released: {
        Args: { p_rental: string }
        Returns: undefined
      }
      rental_set_provider_ref: {
        Args: { p_ref: string; p_rental: string }
        Returns: undefined
      }
      rental_start: {
        Args: {
          p_customer_email?: string
          p_locale?: string
          p_machine_code: string
          p_payment_provider?: string
        }
        Returns: Json
      }
      rental_stuck_unlocks: { Args: { p_minutes?: number }; Returns: string[] }
      rental_unlock_confirmed: {
        Args: {
          p_battery_serial: string
          p_provider_ref: string
          p_rental: string
          p_slot: number
          p_source?: string
        }
        Returns: Json
      }
      rental_unlock_failed: {
        Args: { p_final: boolean; p_reason: string; p_rental: string }
        Returns: Json
      }
      role_rank: { Args: { r: string }; Returns: number }
      sim_free_slot: { Args: { p_machine: string }; Returns: number }
      sim_machine_state: { Args: { p_machine: string }; Returns: Json }
      sim_pick_battery: { Args: { p_machine: string }; Returns: Json }
      sim_provision_machine: {
        Args: { p_batteries: number; p_machine: string }
        Returns: undefined
      }
      subscription_payment_event: {
        Args: { p_customer: string; p_failed: boolean; p_message: string }
        Returns: string
      }
      subscription_set_customer: {
        Args: { p_customer: string; p_tenant: string }
        Returns: undefined
      }
      subscription_sync: {
        Args: {
          p_cancel_at_period_end: boolean
          p_canceled_at: string
          p_customer: string
          p_period_end: string
          p_price: string
          p_status: string
          p_subscription: string
          p_tenant: string
          p_trial_end: string
        }
        Returns: string
      }
      tenant_machine_limit: { Args: { tid: string }; Returns: number }
      tenant_subscription_ok: { Args: { tid: string }; Returns: boolean }
      webhook_claim: {
        Args: {
          p_account: string
          p_external_id: string
          p_livemode: boolean
          p_payload: Json
          p_source: string
          p_type: string
        }
        Returns: string
      }
      webhook_finish: {
        Args: {
          p_error?: string
          p_external_id: string
          p_source: string
          p_status: string
          p_tenant?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      battery_status: "in_slot" | "rented" | "charging" | "faulty" | "lost"
      machine_connection: "online" | "offline" | "error" | "unknown"
      machine_state: "active" | "maintenance" | "retired"
      membership_status: "active" | "disabled"
      payment_status:
        | "requires_payment"
        | "authorized"
        | "succeeded"
        | "failed"
        | "canceled"
        | "refunded"
        | "partially_refunded"
      refund_state: "none" | "pending" | "partial" | "full" | "failed"
      rental_status:
        | "pending"
        | "active"
        | "returned"
        | "overdue"
        | "failed"
        | "cancelled"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
        | "none"
      tenant_status: "active" | "suspended" | "pending"
      ticket_status: "open" | "pending" | "closed"
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
      battery_status: ["in_slot", "rented", "charging", "faulty", "lost"],
      machine_connection: ["online", "offline", "error", "unknown"],
      machine_state: ["active", "maintenance", "retired"],
      membership_status: ["active", "disabled"],
      payment_status: [
        "requires_payment",
        "authorized",
        "succeeded",
        "failed",
        "canceled",
        "refunded",
        "partially_refunded",
      ],
      refund_state: ["none", "pending", "partial", "full", "failed"],
      rental_status: [
        "pending",
        "active",
        "returned",
        "overdue",
        "failed",
        "cancelled",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
        "none",
      ],
      tenant_status: ["active", "suspended", "pending"],
      ticket_status: ["open", "pending", "closed"],
    },
  },
} as const
