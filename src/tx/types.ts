/** Optional UTF-8 memo/blob attached to an output seed's note-data (PR #116 / wallet CLI). */
export interface OutputNoteData {
  memo?: string;
  blob?: string;
}