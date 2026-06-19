// Maps branch_sync code (b000, b001, …) → Thai company name
export const BRANCH_SYNC_MAP: Record<string, string> = {
  b000: 'บริษัท ช้าง สยาม กัมปนี จำกัด',
  b001: 'บริษัท ช้างสยามรวย จำกัด',
  b002: 'บริษัท ช้าง ทรัพย์ ทวี จำกัด',
  b003: 'บริษัท ชาวทะเลเฮฮา จำกัด',
  b004: 'บริษัท ดีจิงจัง 5665 จำกัด',
  b005: 'บริษัท ฮอมฮัก จำกัด',
};

// Maps Postgres DB name (ปี 2569) → ชื่อกิจการภาษาไทย
const BRANCH_SYNC_NAME_MAP: Record<string, string> = {
  changsiamcompany_2569: 'บริษัท ช้าง สยาม กัมปนี จำกัด',
  changsiamruay_2569: 'บริษัท ช้างสยามรวย จำกัด',
  changsupthawee_2569: 'บริษัท ช้าง ทรัพย์ ทวี จำกัด',
  chaothalayheha_2569: 'บริษัท ชาวทะเลเฮฮา จำกัด',
  deejingjung_2569: 'บริษัท ดีจิงจัง 5665 จำกัด',
  homhug_2569: 'บริษัท ฮอมฮัก จำกัด',
};

export function resolveBranchName(branchSync: string): string {
  return BRANCH_SYNC_MAP[branchSync] ?? `กิจการ ${branchSync}`;
}

export function resolveBranchSyncName(branchSyncName: string): string {
  return BRANCH_SYNC_NAME_MAP[branchSyncName] ?? branchSyncName;
}
