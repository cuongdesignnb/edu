import { membershipStatus, type StatusLabel } from "@/lib/formatters";
export const staffMembershipStatus: Record<string, StatusLabel> = { ...membershipStatus, invited: {label:"Chưa nhận lời mời",tone:"warning"}, invited_member: {label:"Chưa nhận lời mời",tone:"warning"}, unknown:{label:"Không có trạng thái",tone:"neutral"} };
