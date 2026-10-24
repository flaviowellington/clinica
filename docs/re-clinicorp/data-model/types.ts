// Clinicorp data model. One exported type per E-### entity file, same field names.
// Audit columns z_Inserted_* / z_LastChange_* exist on every record (see entity files).

export interface Audit {
  z_Inserted_Date: string; z_LastChange_Date: string;
  z_Inserted_UserId: number; z_LastChange_UserId: number;
}

/** E-001 */
export interface Pessoa extends Audit {
  id: number;
  Type: 'PATIENT' | 'DENTIST';
  Name: string; NameSearch: string;
  BirthDate?: string; SK_BirthDay?: number;
  Email?: string; NoEmail?: string; MobilePhone?: string;
  DocumentId?: string; OtherDocumentId?: string;
  Sex?: string; CivilStatus?: string; Active: string;
  numero_carteirinha?: string | null;
  GeneralComission?: number | null; PlanComission?: number | null; DiscountTaxPercentage?: number | null;
  Color?: string; CRO?: string; Council?: string; Specialties?: { id: number; Description: string }[];
}

export type Canal = 'Schedule' | 'CliniMe' | 'Whats' | 'Sms' | 'Email' | 'Agents';
/** E-002 */
export interface Agendamento extends Audit {
  id: number; date: string; AtomicDate: number; fromTime: string; toTime: string;
  Clinic_BusinessId: number; Dentist_PersonId: number; Patient_PersonId?: number;
  PatientName?: string; Email?: string; MobilePhone?: string;
  ScheduleToId: number; ScheduleToType: string; Type?: 'ASSIGN' | string;
  CategoryId?: number; CategoryColor?: string; CategoryDescription?: string;
  Notes?: string; Procedures?: string; ProceduresDuration?: number; isNew?: string;
  AlertInfo: Partial<Record<`Confirm${Canal}` | `Alert${Canal}`, string>>;
  StatusId?: number; StatusDescription?: string;
  CheckinTime?: number; WaitStart?: number; WaitEnds?: number; Waiting?: string; CheckinUsedIn?: string;
  Deleted?: string; CreatedBy: string; CreateUserId: number; CreateDate: string; ListTagsId: number[];
}

/** E-003 */
export interface Tratamento extends Audit {
  id: number; Patient_PersonId: number; Dentist_PersonId: number; BusinessId: number;
  IsEstimate: string; Status: 'OPEN' | 'APPROVED' | string;
  CreateDate: string; ApprovedDate?: string; ApprovedByUserId?: number; ApprovedByUserName?: string;
  PaymentTypePlan?: string; PaymentFormDescription?: string;
  CurrentEstimatePaymentPlanId?: number; CurrentChargePaymentPlanId?: number;
  EstimateVersion?: number; ValidUntil?: string | null; Notes?: string;
}

/** E-004 */
export interface ItemTratamento extends Audit {
  id: number; TreatmentId: number; Procedure_CharacteristicId: number; PriceId: number; PriceListId: number;
  Tooth?: string; Surface?: string;
  Amount: number; OriginalAmount: number; FinalAmount: number; MinimumProcedureAmount?: number;
  Dentist_PersonId: number; Sequence: number; BillType: string;
  Approved?: boolean; Executed: boolean | string; Existing?: boolean; StatusId?: number; PaymentPlanId?: number;
}

export type FormaPagamento = 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECK' | 'CASH' | 'PIX_CHARGE' | 'TRANSFER';
/** E-005 */
export interface PlanoPagamento extends Audit {
  id: number; Type: 'CHARGE' | string; PaymentType: 'TOTAL' | 'PROCEDURE';
  PaymentForm_CharacteristicId: number; InitialPayment?: string; InstallmentsCount: number;
  Amount: number; Discount?: number; DiscountAmount?: number;
  InstallmentList: { Sequence: number; Installment: number; DueDate: string; PaymentForm_CharacteristicId: number; Amount: number; Modified: boolean }[];
  Approved?: string; ApprovedDate?: string; PatientId: number; BusinessId: number;
}

/** E-006 */
export interface Clinica extends Audit {
  id: number; Type: 'CLINIC'; Name: string; Email?: string; Active: string;
  SlotTime: number; WorkingDaysHours: Record<string, { from: string; to: string }>; ProfessionalRequired?: string;
}

/** E-007 */
export interface Status { id: number; Type: string; Description: string; Reference: string; ReferenceType?: string; Color?: string | null; Active: string }

/** E-008 */
export interface AlertaRetorno extends Audit {
  id: number; Patient_PersonId: number; PatientName: string; Dentist_PersonId: number; Clinic_BusinessId: number;
  AtomicDate: number; ReturnDateDesc: string; Status: number; Reason?: string;
}

/** E-009 */
export interface Preco extends Audit {
  id: number; PriceListId: number; Procedure_CharacteristicId: number; ProcedureName: string;
  ProcedureExpertiseName?: string; Amount: number; OriginalAmount: number; ProcedureCost: number;
  Currency: string; CompensationType?: string; HasSteps?: string; IsValid: string; ValidFrom: string;
}
