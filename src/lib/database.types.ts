import type { DeductedMedicine, Medicine, ScheduleEntry, TakeDoseResult } from "@/lib/types";

export type Database = {
  public: {
    Tables: {
      medicines: {
        Row: Medicine;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          remaining_count?: number;
          reorder_at?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          remaining_count?: number;
          reorder_at?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedule_entries: {
        Row: ScheduleEntry;
        Insert: {
          id?: string;
          user_id: string;
          medicine_id: string;
          scheduled_time: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          medicine_id?: string;
          scheduled_time?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          endpoint?: string;
          p256dh?: string;
          auth?: string;
        };
        Relationships: [];
      };
      dose_logs: {
        Row: {
          id: string;
          user_id: string;
          dose_date: string;
          scheduled_time: string;
          taken_at: string;
          medicines_taken: DeductedMedicine[];
          source: "button" | "nfc";
        };
        Insert: {
          id?: string;
          user_id: string;
          dose_date: string;
          scheduled_time: string;
          taken_at?: string;
          medicines_taken?: DeductedMedicine[];
          source?: "button" | "nfc";
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          timezone?: string;
        };
        Update: {
          timezone?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      take_current_dose: {
        Args: { p_timezone?: string; p_source?: string };
        Returns: TakeDoseResult;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
