export type Medicine = {
  id: string;
  user_id: string;
  name: string;
  remaining_count: number;
  reorder_at: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleEntry = {
  id: string;
  user_id: string;
  medicine_id: string;
  scheduled_time: string;
  sort_order: number;
  created_at: string;
  medicines?: Pick<Medicine, "id" | "name" | "remaining_count"> | null;
};

export type DeductedMedicine = {
  id: string;
  name: string;
  remaining_count: number;
};

export type LowStockMedicine = DeductedMedicine & {
  reorder_at: number;
};

export type TakeDoseResult =
  | {
      status: "ok";
      scheduled_time: string;
      dose_date: string;
      deducted: DeductedMedicine[];
      low_stock: LowStockMedicine[];
    }
  | {
      status: "already_taken";
      scheduled_time: string;
      message: string;
    }
  | {
      status: "no_slot";
      message: string;
    };
