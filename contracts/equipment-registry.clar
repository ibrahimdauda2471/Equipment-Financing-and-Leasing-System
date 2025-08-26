;; Equipment Registry Contract
;; Manages equipment registration, ownership, and lifecycle tracking

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-EQUIPMENT-NOT-FOUND (err u101))
(define-constant ERR-INVALID-STATUS (err u103))
(define-constant ERR-ALREADY-EXISTS (err u105))
(define-constant ERR-INVALID-INPUT (err u106))

;; Data Variables
(define-data-var next-equipment-id uint u1)

;; Data Maps
(define-map equipment-registry
  { equipment-id: uint }
  {
    owner: principal,
    equipment-type: (string-ascii 50),
    model: (string-ascii 100),
    serial-number: (string-ascii 50),
    purchase-price: uint,
    current-value: uint,
    condition: (string-ascii 20),
    status: (string-ascii 20),
    location: (string-ascii 100),
    created-at: uint,
    last-updated: uint
  }
)

(define-map equipment-ownership
  { equipment-id: uint }
  { owner: principal, updated-at: uint }
)

(define-map owner-equipment-count
  { owner: principal }
  { count: uint }
)

(define-map equipment-serial-lookup
  { serial-number: (string-ascii 50) }
  { equipment-id: uint }
)

;; Private Functions
(define-private (is-valid-condition (condition (string-ascii 20)))
  (or
    (is-eq condition "Excellent")
    (is-eq condition "Good")
    (is-eq condition "Fair")
    (is-eq condition "Poor")
    (is-eq condition "Needs Repair")
  )
)

(define-private (is-valid-status (status (string-ascii 20)))
  (or
    (is-eq status "Available")
    (is-eq status "Leased")
    (is-eq status "Maintenance")
    (is-eq status "Retired")
    (is-eq status "Reserved")
  )
)

(define-private (increment-owner-count (owner principal))
  (let ((current-count (default-to u0 (get count (map-get? owner-equipment-count { owner: owner })))))
    (map-set owner-equipment-count
      { owner: owner }
      { count: (+ current-count u1) }
    )
  )
)

(define-private (decrement-owner-count (owner principal))
  (let ((current-count (default-to u0 (get count (map-get? owner-equipment-count { owner: owner })))))
    (if (> current-count u0)
      (map-set owner-equipment-count
        { owner: owner }
        { count: (- current-count u1) }
      )
      true
    )
  )
)

;; Public Functions

;; Register new equipment
(define-public (register-equipment
  (equipment-type (string-ascii 50))
  (model (string-ascii 100))
  (serial-number (string-ascii 50))
  (purchase-price uint)
  (condition (string-ascii 20))
  (location (string-ascii 100))
)
  (let
    (
      (equipment-id (var-get next-equipment-id))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Validate inputs
    (asserts! (> (len equipment-type) u0) ERR-INVALID-INPUT)
    (asserts! (> (len model) u0) ERR-INVALID-INPUT)
    (asserts! (> (len serial-number) u0) ERR-INVALID-INPUT)
    (asserts! (> purchase-price u0) ERR-INVALID-INPUT)
    (asserts! (is-valid-condition condition) ERR-INVALID-INPUT)
    (asserts! (> (len location) u0) ERR-INVALID-INPUT)

    ;; Check if serial number already exists
    (asserts! (is-none (map-get? equipment-serial-lookup { serial-number: serial-number })) ERR-ALREADY-EXISTS)

    ;; Register equipment
    (map-set equipment-registry
      { equipment-id: equipment-id }
      {
        owner: tx-sender,
        equipment-type: equipment-type,
        model: model,
        serial-number: serial-number,
        purchase-price: purchase-price,
        current-value: purchase-price,
        condition: condition,
        status: "Available",
        location: location,
        created-at: current-time,
        last-updated: current-time
      }
    )

    ;; Set ownership
    (map-set equipment-ownership
      { equipment-id: equipment-id }
      { owner: tx-sender, updated-at: current-time }
    )

    ;; Add serial number lookup
    (map-set equipment-serial-lookup
      { serial-number: serial-number }
      { equipment-id: equipment-id }
    )

    ;; Increment owner count
    (increment-owner-count tx-sender)

    ;; Increment next equipment ID
    (var-set next-equipment-id (+ equipment-id u1))

    (ok equipment-id)
  )
)

;; Transfer equipment ownership
(define-public (transfer-equipment (equipment-id uint) (new-owner principal))
  (let
    (
      (equipment-data (unwrap! (map-get? equipment-registry { equipment-id: equipment-id }) ERR-EQUIPMENT-NOT-FOUND))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Check authorization
    (asserts! (is-eq tx-sender (get owner equipment-data)) ERR-NOT-AUTHORIZED)

    ;; Check equipment is available for transfer
    (asserts! (is-eq (get status equipment-data) "Available") ERR-INVALID-STATUS)

    ;; Update ownership
    (map-set equipment-ownership
      { equipment-id: equipment-id }
      { owner: new-owner, updated-at: current-time }
    )

    ;; Update equipment registry
    (map-set equipment-registry
      { equipment-id: equipment-id }
      (merge equipment-data {
        owner: new-owner,
        last-updated: current-time
      })
    )

    ;; Update owner counts
    (decrement-owner-count tx-sender)
    (increment-owner-count new-owner)

    (ok true)
  )
)

;; Update equipment status
(define-public (update-equipment-status (equipment-id uint) (new-status (string-ascii 20)))
  (let
    (
      (equipment-data (unwrap! (map-get? equipment-registry { equipment-id: equipment-id }) ERR-EQUIPMENT-NOT-FOUND))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Check authorization (owner or contract owner)
    (asserts! (or
      (is-eq tx-sender (get owner equipment-data))
      (is-eq tx-sender CONTRACT-OWNER)
    ) ERR-NOT-AUTHORIZED)

    ;; Validate status
    (asserts! (is-valid-status new-status) ERR-INVALID-INPUT)

    ;; Update equipment
    (map-set equipment-registry
      { equipment-id: equipment-id }
      (merge equipment-data {
        status: new-status,
        last-updated: current-time
      })
    )

    (ok true)
  )
)

;; Update equipment condition
(define-public (update-equipment-condition (equipment-id uint) (new-condition (string-ascii 20)))
  (let
    (
      (equipment-data (unwrap! (map-get? equipment-registry { equipment-id: equipment-id }) ERR-EQUIPMENT-NOT-FOUND))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Check authorization (owner or contract owner)
    (asserts! (or
      (is-eq tx-sender (get owner equipment-data))
      (is-eq tx-sender CONTRACT-OWNER)
    ) ERR-NOT-AUTHORIZED)

    ;; Validate condition
    (asserts! (is-valid-condition new-condition) ERR-INVALID-INPUT)

    ;; Update equipment
    (map-set equipment-registry
      { equipment-id: equipment-id }
      (merge equipment-data {
        condition: new-condition,
        last-updated: current-time
      })
    )

    (ok true)
  )
)

;; Update equipment value (for depreciation)
(define-public (update-equipment-value (equipment-id uint) (new-value uint))
  (let
    (
      (equipment-data (unwrap! (map-get? equipment-registry { equipment-id: equipment-id }) ERR-EQUIPMENT-NOT-FOUND))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Check authorization (owner or contract owner)
    (asserts! (or
      (is-eq tx-sender (get owner equipment-data))
      (is-eq tx-sender CONTRACT-OWNER)
    ) ERR-NOT-AUTHORIZED)

    ;; Validate value (cannot exceed purchase price)
    (asserts! (<= new-value (get purchase-price equipment-data)) ERR-INVALID-INPUT)

    ;; Update equipment
    (map-set equipment-registry
      { equipment-id: equipment-id }
      (merge equipment-data {
        current-value: new-value,
        last-updated: current-time
      })
    )

    (ok true)
  )
)

;; Update equipment location
(define-public (update-equipment-location (equipment-id uint) (new-location (string-ascii 100)))
  (let
    (
      (equipment-data (unwrap! (map-get? equipment-registry { equipment-id: equipment-id }) ERR-EQUIPMENT-NOT-FOUND))
      (current-time (unwrap-panic (get-block-info? time (- block-height u1))))
    )
    ;; Check authorization (owner or contract owner)
    (asserts! (or
      (is-eq tx-sender (get owner equipment-data))
      (is-eq tx-sender CONTRACT-OWNER)
    ) ERR-NOT-AUTHORIZED)

    ;; Validate location
    (asserts! (> (len new-location) u0) ERR-INVALID-INPUT)

    ;; Update equipment
    (map-set equipment-registry
      { equipment-id: equipment-id }
      (merge equipment-data {
        location: new-location,
        last-updated: current-time
      })
    )

    (ok true)
  )
)

;; Read-only Functions

;; Get equipment details
(define-read-only (get-equipment (equipment-id uint))
  (map-get? equipment-registry { equipment-id: equipment-id })
)

;; Get equipment owner
(define-read-only (get-equipment-owner (equipment-id uint))
  (map-get? equipment-ownership { equipment-id: equipment-id })
)

;; Get equipment by serial number
(define-read-only (get-equipment-by-serial (serial-number (string-ascii 50)))
  (match (map-get? equipment-serial-lookup { serial-number: serial-number })
    lookup-data (get-equipment (get equipment-id lookup-data))
    none
  )
)

;; Get owner equipment count
(define-read-only (get-owner-equipment-count (owner principal))
  (default-to u0 (get count (map-get? owner-equipment-count { owner: owner })))
)

;; Check if equipment exists
(define-read-only (equipment-exists (equipment-id uint))
  (is-some (map-get? equipment-registry { equipment-id: equipment-id }))
)

;; Check if serial number exists
(define-read-only (serial-number-exists (serial-number (string-ascii 50)))
  (is-some (map-get? equipment-serial-lookup { serial-number: serial-number }))
)

;; Get next equipment ID
(define-read-only (get-next-equipment-id)
  (var-get next-equipment-id)
)

;; Check if caller is equipment owner
(define-read-only (is-equipment-owner (equipment-id uint) (caller principal))
  (match (map-get? equipment-registry { equipment-id: equipment-id })
    equipment-data (is-eq caller (get owner equipment-data))
    false
  )
)

;; Get equipment status
(define-read-only (get-equipment-status (equipment-id uint))
  (match (map-get? equipment-registry { equipment-id: equipment-id })
    equipment-data (some (get status equipment-data))
    none
  )
)

;; Calculate depreciation (simple straight-line method)
(define-read-only (calculate-depreciation (equipment-id uint) (years uint))
  (match (map-get? equipment-registry { equipment-id: equipment-id })
    equipment-data
      (let
        (
          (purchase-price (get purchase-price equipment-data))
          (depreciation-rate u10) ;; 10% per year
          (total-depreciation (* years depreciation-rate))
        )
        (if (>= total-depreciation u100)
          u0
          (- purchase-price (/ (* purchase-price total-depreciation) u100))
        )
      )
    u0
  )
)
