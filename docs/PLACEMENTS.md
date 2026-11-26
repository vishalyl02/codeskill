# Campus placements

Students open **Placements** from the website navigation (`/placements`). Admins use **Placements** in the admin sidebar (`/admin/placements`). Both require the existing sign-in flow.

## Publishing a company visit

1. Choose **Add company** and enter its name, profile, package/CTC, optional role and visit date. Upload an optional PNG, JPEG or WebP company logo (up to 5 MB); it is resized locally to at most 320 pixels and saved with the entry. The logo replaces initials on cards and in the full detail view. Existing logos can be replaced or removed in the edit form.
2. Add preparation links, one per line: `Title | https://example.com`.
3. Select multiple PDFs under job descriptions, company profiles, or learning resources.
4. Select **Published** and save. The UI saves a draft, uploads its PDFs, and publishes only after all uploads succeed. A failed upload leaves a recoverable draft.

Draft and archived entries are visible only to admins. Students see compact company cards with package details and resource counts. **Open placement** opens a spacious page-style detail view with the full company profile, complete filenames, bordered PDF groups, separate preview and download buttons, and preparation links. PDFs open in an accessible dialog before downloading. The student list refreshes when the window regains focus, or with its Refresh button. Search matches company name, role and profile. Admins can edit entries, preview or remove existing PDFs directly inside each upload group, unpublish and archive.

## Files and permissions

- The editor uploads selected PDFs one at a time to stay below deployment proxy request limits and retains unfinished files for retry. Up to 10 PDFs per upload group/request, 10 MiB per file, and 30 attached PDFs per placement.
- Company logos accept raster images only, with server-side format/signature checks and a 128 KiB limit after resizing. The optimized image is stored in the database, so no public logo upload directory is required.
- PDF MIME type and file signature are checked. Resource URLs must use HTTP or HTTPS.
- Files use generated storage names and are served through authenticated download endpoints. Students cannot download draft or archived documents, including with a previously copied URL.
- Storage paths and creator IDs are excluded from API responses.
- Mutating endpoints and the management list use the existing AdminGuard. This retains the platform's existing admin role definitions.

## Deployment

The additive `placements` schema migration runs through the existing assessment rollout runner, `db:migrate`, and automatic database migration service. It does not modify judge or submission tables.

Production defaults to private S3 storage using the platform's existing `AWS_S3_BUCKET_NAME` (or Terraform’s `S3_BUCKET_NAME`), `AWS_REGION`, and IAM credentials. PDF objects live under `placements/` with AES256 server-side encryption; bytes are delivered only through the authenticated API. The backend role needs `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` for that prefix. No bucket ACL or public URL is created. A missing bucket produces a configuration error instead of silently storing PDFs on an ephemeral production instance.

Local development defaults to `.placement-files` under the backend working directory, excluded from Git. Set `PLACEMENTS_UPLOAD_DIR` to override the directory. `PLACEMENTS_STORAGE=local` can explicitly select filesystem storage for a deployment with a private persistent shared volume. All instances must use the same storage mode. Back up stored PDFs together with the database; JSON document metadata alone does not contain PDF bytes.

## API

All paths use the normal `/api` prefix and existing JWT authentication:

| Method | Path | Access |
| --- | --- | --- |
| GET | `/placements` | Signed-in users; published entries |
| GET | `/placements/manage` | Admin |
| POST | `/placements` | Admin |
| PUT | `/placements/:id` | Admin |
| POST | `/placements/:id/documents?category=job-description` | Admin; multipart `files` |
| GET | `/placements/:id/documents/:docId` | Admin or published-entry student |
| DELETE | `/placements/:id/documents/:docId` | Admin |

Document category values: `job-description`, `company-profile`, `learning-resource`.

## Firewall deployment for PDF uploads

The WAF size-label rule exempts only `POST /api/placements/<UUID>/documents` (plus the pre-existing import exceptions). Other placement methods and routes keep the original body-size protection, and all other managed rules remain enabled. NestJS still requires JWT authentication and an admin role, validates the PDF signature, and limits each PDF to 10 MiB.

The application rollout and Web ACL deployment run separately. Use `terraform/environments/production` with the existing production state. From the repository root, `./terraform/scripts/deploy.sh` selects that directory and checks the state before planning. Review the proposed change to `module.waf.aws_wafv2_web_acl.main` alongside any production drift before applying, then retry the PDF upload.

If an upload still returns 403, find the rejected `POST /api/placements/<UUID>/documents` in the `codeskill-prod-waf` sampled requests or logs in `ap-south-1`. Capture the terminating rule name before changing any firewall rules.
