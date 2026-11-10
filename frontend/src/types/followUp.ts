// Provisional development Mock contract, independent of the backend API.
export type FollowUp = { id: string; question: string; answer: string }
export type FollowUpSnapshot = { chatId: string; items: FollowUp[]; remaining: number }
export type FollowUpRequest = { question: string; clientRequestId: string }
