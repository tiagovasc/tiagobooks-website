# Security and privacy

Do not post credentials, exploitable vulnerability details or personal data in public issues. Use GitHub's **Security → Report a vulnerability** for confidential reports when available. Include the affected route, reproduction steps and impact using synthetic data.

Production secrets and library database records are stored outside this repository. The Node server handles authenticated writes; browsers must never receive a Supabase service credential. Local editing is disabled in production, where publishing uses GitHub permissions through Sveltia CMS.

Run `npm run check:public` before committing. This catches common accidental private files, personal machine paths, credential formats and non-public content flags; it is a guardrail, not a complete secret scanner. Review diffs and image metadata before publishing. CI cannot undo disclosure of something already pushed.

If a credential is exposed, revoke/rotate it first, then clean the source and history. Removing a file in a later commit does not remove earlier versions.
