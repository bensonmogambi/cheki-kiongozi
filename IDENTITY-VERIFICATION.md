# Identity-verification provider contract

The accountless voter form does not request an ID or phone while provider configuration is absent. A voter can open `/vote` without registering or signing in. Do not enable the provider gate until the organization has completed its Kenyan privacy/legal review and configured an authorized identity-verification provider.

## Required server settings

Set these in the server environment (never in browser JavaScript or a committed file):

- `IDENTITY_PROCESSING_APPROVED=true` only after the required review and safeguards are complete
- `IDENTITY_PROVIDER_NAME` for the voter consent screen
- `IDENTITY_PROVIDER_START_URL` and `IDENTITY_PROVIDER_CONFIRM_URL`, both HTTPS URLs
- `IDENTITY_PROVIDER_TOKEN` for server-to-provider authentication
- `IDENTITY_PROVIDER_PRIVACY_URL` for the provider’s privacy information
- `IDENTITY_HASH_SECRET`, a private random secret of at least 32 characters

The platform also expects `MIN_VOTES_TO_PUBLISH` (or office-specific minimums) to be set to the published minimum before it reveals leader vote counts. Letter grades remain disabled until valid public bands are configured.

## Provider API shape used by this adapter

The adapter sends the national ID and phone number to the start URL as JSON:

```json
{"nationalId":"…","phone":"…","purpose":"civic-voter-verification"}
```

The provider should match the ID using an authorized source, check that the phone is registered to that ID where supported, and send its OTP. Cheki Kiongozi does not connect directly to the National Registration Bureau database. The provider must respond with:

```json
{"status":"otp_sent","challengeId":"opaque-provider-challenge"}
```

The OTP is posted to the confirm URL as:

```json
{"challengeId":"opaque-provider-challenge","otp":"…"}
```

On success, the provider responds:

```json
{"verified":true,"subjectReference":"stable-opaque-reference"}
```

The provider’s stable subject reference is immediately converted to a keyed HMAC. Raw ID and phone values are not written to an account store, rating records, admin responses, or application logs. The anonymous voter session holds the hash temporarily; each submitted grade stores it to prevent repeat votes across sessions. The opaque OTP challenge is held in process memory for at most ten minutes. A provider with a different API needs a dedicated adapter before it can be connected; do not point these settings at an unreviewed endpoint.

This contract is not a provider integration or legal approval by itself. Complete the DPIA, data-controller/processor registration and agreements, privacy notices, retention rules and security review before enabling identity processing. ODPC guidance identifies ID numbers and phone numbers as personal data and calls for a DPIA when processing is likely to create high risk; linking verified identity to civic ratings needs careful review.
