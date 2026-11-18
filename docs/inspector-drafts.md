# Private inspector drafts

The home screen shows **Черновики**. **Продолжить** restores the selected form,
original photographs and saved step. Opening the profile/home or starting another
inspection preserves existing drafts. Saving never submits a business inspection
or creates a quality-control task. Only **Отправить** performs the existing
inspection submission/readiness/address workflow.

Partial forms are saved in a separate PostgreSQL InspectionDraft table, scoped
to the authenticated inspector and active inspection organization. QA/managers
cannot read them. JWT/session/identity gates apply. Original files stay in private
server storage and download through an owner-checked route; no external services
receive them. Inspection attachment reuses staged server files through the normal
inspection authorization, screening and quality notification path.

Browser IndexedDB is a per-user, per-draft outbox. Edits debounce for 300 ms locally
and two seconds remotely; navigation flushes immediately. If the network fails,
the local copy remains and a warning explains that the server save is incomplete.
A device must finish synchronization before its newest files can be available on
another device. Clearing site data removes unsynchronized local changes only.
Original bytes are unchanged. Version acknowledgements update metadata without
re-reading/copying every original photo.

Optimistic versions reject stale writes from another device instead of silently
overwriting a newer draft. Successful submission removes the private draft row
and its browser outbox entry, preserving other drafts. The additive migration
keeps its table on code rollback so saved drafts remain recoverable. Existing
inspection/certificate rows and identity templates are unchanged.
