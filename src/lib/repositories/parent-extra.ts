/**
 * Parent group extras (read-only). Every call first re-validates the link through
 * parentRepo.open so revoked/expired/suspended links fail exactly like the main
 * projection. Never returns student data.
 */
import { read } from "./core";
import { parentRepo, type ParentKey } from "./parent";

export const parentExtraRepo = {
  /** Range of the granted academic year — used to limit prev/next navigation (PA03/PA06). */
  async grantedYear(key: ParentKey, slug: string) {
    await parentRepo.open(key, slug);
    return read((db) => {
      const pa = "preview" in key ? db.parentAccesses.find((p) => p.id === key.preview.accessId) : db.parentAccesses.find((p) => p.token === key.token);
      const year = db.years.find((y) => y.id === pa?.yearId);
      return year ? { label: year.label, startDate: year.startDate, endDate: year.endDate } : null;
    });
  },

};
