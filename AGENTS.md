<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Roles live in `user_roles` and are checked in RLS via `has_role`/`is_staff`; why: prevents privilege escalation.
- Complaint history, notifications and audit entries are written by DB triggers; why: every change is recorded regardless of client.
- Evidence files live in the private `evidence` bucket under `<complaint_id>/...` and are opened via signed URLs; versions auto-increment, never overwrite.
