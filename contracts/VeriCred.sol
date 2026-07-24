// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  VeriCred — Academic Credential Anchoring Registry
 * @notice Anchors academic credentials on-chain by storing only the IPFS
 *         Content Identifier (CID) of the encrypted certificate file.
 *
 * @dev    DESIGN RULE — no personal data on-chain.
 *
 *         The certificate file is encrypted off-chain and pinned to IPFS.
 *         Only its CID is written here. Because an IPFS CID is a multihash of
 *         the file's own bytes, the CID *is* the integrity fingerprint: change
 *         one byte of the certificate and it hashes to a different CID, which
 *         no longer matches what was anchored. No separate "certificate hash"
 *         field is needed, and none is stored.
 *
 *         Names, student IDs and programme data live in the off-chain MySQL
 *         index, never in this contract. A public ledger is permanent and
 *         world-readable; personal data must not be placed in it.
 *
 *         REVOCATION IS APPEND-ONLY. Revoking flips a flag and records a
 *         reason. It never deletes the issuance record, and the original
 *         CredentialIssued event remains on the chain forever.
 */
contract VeriCred {
    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Storage layout is packed deliberately.
     *      issuer (20 bytes) + issuedAt (5) + revokedAt (5) + revoked (1)
     *      = 31 bytes, so these four fields share a single 32-byte slot.
     *      uint40 holds unix seconds until the year 36812, which is ample.
     */
    struct Credential {
        address issuer;           // institution wallet that anchored it
        uint40  issuedAt;         // block timestamp at issuance
        uint40  revokedAt;        // 0 while the credential still stands
        bool    revoked;          // status flag — never a deletion
        string  cid;              // IPFS CID: the integrity fingerprint
        string  credentialId;     // human-readable, e.g. "VC-2026-0001"
        string  revocationReason; // published with the revocation
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    address public admin;

    /// @notice Wallets permitted to issue credentials.
    mapping(address => bool) public isInstitution;

    /// @dev keccak256(credentialId) => record. Hashing gives fixed-size keys.
    mapping(bytes32 => Credential) private _credentials;

    /// @dev Enumeration support, so a frontend can list every record.
    bytes32[] private _index;

    // ─────────────────────────────────────────────────────────────
    // Events — the permanent audit trail
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev `credentialId` is emitted twice on purpose: the indexed bytes32
     *      hash makes the event efficiently filterable, while the plain
     *      string keeps the log human-readable in a block explorer.
     */
    event CredentialIssued(
        bytes32 indexed idHash,
        address indexed issuer,
        string  credentialId,
        string  cid,
        uint256 issuedAt
    );

    event CredentialRevoked(
        bytes32 indexed idHash,
        address indexed revokedBy,
        string  credentialId,
        string  reason,
        uint256 revokedAt
    );

    event InstitutionAuthorised(address indexed institution, address indexed by);
    event InstitutionRemoved(address indexed institution, address indexed by);
    event AdminTransferred(address indexed from, address indexed to);

    // ─────────────────────────────────────────────────────────────
    // Errors — cheaper than require strings
    // ─────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotAuthorisedInstitution();
    error NotIssuerOrAdmin();
    error CredentialAlreadyExists(string credentialId);
    error CredentialNotFound(string credentialId);
    error CredentialAlreadyRevoked(string credentialId);
    error EmptyCredentialId();
    error EmptyCid();
    error EmptyReason();
    error ZeroAddress();
    error LengthMismatch();

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyInstitution() {
        if (!isInstitution[msg.sender]) revert NotAuthorisedInstitution();
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────

    /// @dev The deployer becomes admin and the first authorised institution,
    ///      so a freshly deployed contract is immediately usable in the demo.
    constructor() {
        admin = msg.sender;
        isInstitution[msg.sender] = true;
        emit AdminTransferred(address(0), msg.sender);
        emit InstitutionAuthorised(msg.sender, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // Administration
    // ─────────────────────────────────────────────────────────────

    function authoriseInstitution(address institution) external onlyAdmin {
        if (institution == address(0)) revert ZeroAddress();
        isInstitution[institution] = true;
        emit InstitutionAuthorised(institution, msg.sender);
    }

    /**
     * @notice Removes an institution's ability to issue new credentials.
     * @dev    Credentials it already anchored remain valid. Losing the right
     *         to issue in future is not the same as your past awards being
     *         void, and the contract must not conflate the two.
     */
    function removeInstitution(address institution) external onlyAdmin {
        isInstitution[institution] = false;
        emit InstitutionRemoved(institution, msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        address previous = admin;
        admin = newAdmin;
        emit AdminTransferred(previous, newAdmin);
    }

    // ─────────────────────────────────────────────────────────────
    // Issuance
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Anchors a credential. Only an authorised institution can call it.
     * @param  credentialId Human-readable identifier, e.g. "VC-2026-0001".
     * @param  cid          IPFS CID of the encrypted certificate file.
     *
     * @dev    A credentialId can be anchored exactly once. Allowing an
     *         overwrite would let an institution silently swap the file behind
     *         an identifier an employer had already verified, which defeats
     *         the purpose of anchoring anything at all.
     */
    function issueCredential(string calldata credentialId, string calldata cid)
        external
        onlyInstitution
    {
        if (bytes(credentialId).length == 0) revert EmptyCredentialId();
        if (bytes(cid).length == 0) revert EmptyCid();

        bytes32 idHash = keccak256(bytes(credentialId));
        if (_exists(idHash)) revert CredentialAlreadyExists(credentialId);

        _credentials[idHash] = Credential({
            issuer:           msg.sender,
            issuedAt:         uint40(block.timestamp),
            revokedAt:        0,
            revoked:          false,
            cid:              cid,
            credentialId:     credentialId,
            revocationReason: ""
        });
        _index.push(idHash);

        emit CredentialIssued(idHash, msg.sender, credentialId, cid, block.timestamp);
    }

    /**
     * @notice Anchors many credentials in one transaction.
     * @dev    Graduation is a batch event — a whole cohort is conferred on the
     *         same day. One transaction for 200 graduates pays the ~21,000 gas
     *         base cost once instead of 200 times.
     */
    function issueCredentialBatch(
        string[] calldata credentialIds,
        string[] calldata cids
    ) external onlyInstitution {
        uint256 n = credentialIds.length;
        if (n != cids.length) revert LengthMismatch();

        for (uint256 i = 0; i < n; ++i) {
            string calldata credentialId = credentialIds[i];
            string calldata cid = cids[i];

            if (bytes(credentialId).length == 0) revert EmptyCredentialId();
            if (bytes(cid).length == 0) revert EmptyCid();

            bytes32 idHash = keccak256(bytes(credentialId));
            if (_exists(idHash)) revert CredentialAlreadyExists(credentialId);

            _credentials[idHash] = Credential({
                issuer:           msg.sender,
                issuedAt:         uint40(block.timestamp),
                revokedAt:        0,
                revoked:          false,
                cid:              cid,
                credentialId:     credentialId,
                revocationReason: ""
            });
            _index.push(idHash);

            emit CredentialIssued(idHash, msg.sender, credentialId, cid, block.timestamp);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Revocation
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Withdraws a credential. Callable by the issuing institution or
     *         the admin.
     * @dev    This APPENDS a status change. The Credential struct, its CID and
     *         the original CredentialIssued event all survive untouched, so
     *         the history of the award remains auditable forever. A reason is
     *         mandatory because it is published to the permanent audit trail.
     */
    function revokeCredential(string calldata credentialId, string calldata reason)
        external
    {
        if (bytes(reason).length == 0) revert EmptyReason();

        bytes32 idHash = keccak256(bytes(credentialId));
        if (!_exists(idHash)) revert CredentialNotFound(credentialId);

        Credential storage c = _credentials[idHash];
        if (c.revoked) revert CredentialAlreadyRevoked(credentialId);
        if (msg.sender != c.issuer && msg.sender != admin) revert NotIssuerOrAdmin();

        c.revoked          = true;
        c.revokedAt        = uint40(block.timestamp);
        c.revocationReason = reason;

        emit CredentialRevoked(idHash, msg.sender, credentialId, reason, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    // Verification — free, public, read-only
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Verifies a credential. Callable by anyone, costs no gas.
     * @return exists  Whether anything was ever anchored under this identifier.
     * @return valid   True only if it exists AND has not been revoked.
     * @return cid     The anchored CID — the caller recomputes the CID of the
     *                 file they were given and compares it with this value.
     * @return issuer  The institution wallet that anchored it.
     * @return issuedAt Unix timestamp of issuance.
     *
     * @dev    `exists` and `valid` are returned separately on purpose. A forged
     *         certificate (never anchored) and a genuine but withdrawn one are
     *         different situations, and an employer needs to tell them apart.
     */
    function verifyCredential(string calldata credentialId)
        external
        view
        returns (
            bool    exists,
            bool    valid,
            string memory cid,
            address issuer,
            uint256 issuedAt
        )
    {
        bytes32 idHash = keccak256(bytes(credentialId));
        Credential storage c = _credentials[idHash];

        exists = bytes(c.cid).length != 0;
        if (!exists) {
            return (false, false, "", address(0), 0);
        }
        return (true, !c.revoked, c.cid, c.issuer, uint256(c.issuedAt));
    }

    /// @notice Full record, including revocation detail.
    function getCredential(string calldata credentialId)
        external
        view
        returns (Credential memory)
    {
        bytes32 idHash = keccak256(bytes(credentialId));
        if (!_exists(idHash)) revert CredentialNotFound(credentialId);
        return _credentials[idHash];
    }

    /// @notice Convenience one-liner for a frontend badge.
    function isValid(string calldata credentialId) external view returns (bool) {
        Credential storage c = _credentials[keccak256(bytes(credentialId))];
        return bytes(c.cid).length != 0 && !c.revoked;
    }

    // ─────────────────────────────────────────────────────────────
    // Enumeration
    // ─────────────────────────────────────────────────────────────

    function totalCredentials() external view returns (uint256) {
        return _index.length;
    }

    /**
     * @notice Page through every anchored credential.
     * @dev    Paginated rather than returning the whole array, which would
     *         eventually exceed the node's gas cap on a large cohort.
     */
    function getCredentialsPaged(uint256 offset, uint256 limit)
        external
        view
        returns (Credential[] memory page)
    {
        uint256 total = _index.length;
        if (offset >= total) return new Credential[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        page = new Credential[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _credentials[_index[i]];
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────

    /// @dev A non-empty CID is the existence marker — every issued record has
    ///      one, and issueCredential rejects an empty CID.
    function _exists(bytes32 idHash) private view returns (bool) {
        return bytes(_credentials[idHash].cid).length != 0;
    }
}
