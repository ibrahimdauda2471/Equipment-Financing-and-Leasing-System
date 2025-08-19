import { describe, it, expect, beforeEach } from "vitest"

// Mock Clarity contract functions for testing
const mockContractState = {
  equipmentRegistry: new Map(),
  equipmentOwnership: new Map(),
  ownerEquipmentCount: new Map(),
  equipmentSerialLookup: new Map(),
  nextEquipmentId: 1,
}

// Mock contract functions
const mockContract = {
  registerEquipment: (equipmentType, model, serialNumber, purchasePrice, condition, location) => {
    // Validate inputs
    if (!equipmentType || equipmentType.length === 0) return { error: "ERR-INVALID-INPUT" }
    if (!model || model.length === 0) return { error: "ERR-INVALID-INPUT" }
    if (!serialNumber || serialNumber.length === 0) return { error: "ERR-INVALID-INPUT" }
    if (purchasePrice <= 0) return { error: "ERR-INVALID-INPUT" }
    if (!["Excellent", "Good", "Fair", "Poor", "Needs Repair"].includes(condition))
      return { error: "ERR-INVALID-INPUT" }
    if (!location || location.length === 0) return { error: "ERR-INVALID-INPUT" }
    
    // Check if serial number already exists
    if (mockContractState.equipmentSerialLookup.has(serialNumber)) {
      return { error: "ERR-ALREADY-EXISTS" }
    }
    
    const equipmentId = mockContractState.nextEquipmentId
    const currentTime = Date.now()
    const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM" // Mock sender
    
    // Register equipment
    mockContractState.equipmentRegistry.set(equipmentId, {
      owner,
      equipmentType,
      model,
      serialNumber,
      purchasePrice,
      currentValue: purchasePrice,
      condition,
      status: "Available",
      location,
      createdAt: currentTime,
      lastUpdated: currentTime,
    })
    
    // Set ownership
    mockContractState.equipmentOwnership.set(equipmentId, {
      owner,
      updatedAt: currentTime,
    })
    
    // Add serial number lookup
    mockContractState.equipmentSerialLookup.set(serialNumber, { equipmentId })
    
    // Increment owner count
    const currentCount = mockContractState.ownerEquipmentCount.get(owner) || 0
    mockContractState.ownerEquipmentCount.set(owner, currentCount + 1)
    
    // Increment next equipment ID
    mockContractState.nextEquipmentId += 1
    
    return { success: equipmentId }
  },
  
  getEquipment: (equipmentId) => {
    return mockContractState.equipmentRegistry.get(equipmentId) || null
  },
  
  updateEquipmentStatus: (equipmentId, newStatus, caller) => {
    const equipment = mockContractState.equipmentRegistry.get(equipmentId)
    if (!equipment) return { error: "ERR-EQUIPMENT-NOT-FOUND" }
    
    // Check authorization
    if (caller !== equipment.owner && caller !== "CONTRACT-OWNER") {
      return { error: "ERR-NOT-AUTHORIZED" }
    }
    
    // Validate status
    if (!["Available", "Leased", "Maintenance", "Retired", "Reserved"].includes(newStatus)) {
      return { error: "ERR-INVALID-INPUT" }
    }
    
    equipment.status = newStatus
    equipment.lastUpdated = Date.now()
    
    return { success: true }
  },
  
  transferEquipment: (equipmentId, newOwner, caller) => {
    const equipment = mockContractState.equipmentRegistry.get(equipmentId)
    if (!equipment) return { error: "ERR-EQUIPMENT-NOT-FOUND" }
    
    // Check authorization
    if (caller !== equipment.owner) return { error: "ERR-NOT-AUTHORIZED" }
    
    // Check equipment is available for transfer
    if (equipment.status !== "Available") return { error: "ERR-INVALID-STATUS" }
    
    const currentTime = Date.now()
    
    // Update ownership
    mockContractState.equipmentOwnership.set(equipmentId, {
      owner: newOwner,
      updatedAt: currentTime,
    })
    
    // Update equipment registry
    equipment.owner = newOwner
    equipment.lastUpdated = currentTime
    
    // Update owner counts
    const oldOwnerCount = mockContractState.ownerEquipmentCount.get(caller) || 0
    const newOwnerCount = mockContractState.ownerEquipmentCount.get(newOwner) || 0
    
    if (oldOwnerCount > 0) {
      mockContractState.ownerEquipmentCount.set(caller, oldOwnerCount - 1)
    }
    mockContractState.ownerEquipmentCount.set(newOwner, newOwnerCount + 1)
    
    return { success: true }
  },
}

describe("Equipment Registry Contract", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockContractState.equipmentRegistry.clear()
    mockContractState.equipmentOwnership.clear()
    mockContractState.ownerEquipmentCount.clear()
    mockContractState.equipmentSerialLookup.clear()
    mockContractState.nextEquipmentId = 1
  })
  
  describe("Equipment Registration", () => {
    it("should register new equipment successfully", () => {
      const result = mockContract.registerEquipment(
          "Excavator",
          "CAT 320D",
          "CAT123456789",
          250000,
          "Excellent",
          "Construction Site A",
      )
      
      expect(result.success).toBe(1)
      
      const equipment = mockContract.getEquipment(1)
      expect(equipment).toBeDefined()
      expect(equipment.equipmentType).toBe("Excavator")
      expect(equipment.model).toBe("CAT 320D")
      expect(equipment.serialNumber).toBe("CAT123456789")
      expect(equipment.purchasePrice).toBe(250000)
      expect(equipment.condition).toBe("Excellent")
      expect(equipment.status).toBe("Available")
      expect(equipment.location).toBe("Construction Site A")
    })
    
    it("should reject registration with invalid inputs", () => {
      // Empty equipment type
      let result = mockContract.registerEquipment("", "Model", "Serial", 100000, "Good", "Location")
      expect(result.error).toBe("ERR-INVALID-INPUT")
      
      // Zero purchase price
      result = mockContract.registerEquipment("Type", "Model", "Serial", 0, "Good", "Location")
      expect(result.error).toBe("ERR-INVALID-INPUT")
      
      // Invalid condition
      result = mockContract.registerEquipment("Type", "Model", "Serial", 100000, "Invalid", "Location")
      expect(result.error).toBe("ERR-INVALID-INPUT")
    })
    
    it("should reject duplicate serial numbers", () => {
      // Register first equipment
      const result1 = mockContract.registerEquipment(
          "Excavator",
          "CAT 320D",
          "CAT123456789",
          250000,
          "Excellent",
          "Site A",
      )
      expect(result1.success).toBe(1)
      
      // Try to register with same serial number
      const result2 = mockContract.registerEquipment(
          "Bulldozer",
          "CAT D6T",
          "CAT123456789", // Same serial number
          300000,
          "Good",
          "Site B",
      )
      expect(result2.error).toBe("ERR-ALREADY-EXISTS")
    })
    
    it("should increment equipment IDs correctly", () => {
      const result1 = mockContract.registerEquipment("Type1", "Model1", "Serial1", 100000, "Good", "Location1")
      expect(result1.success).toBe(1)
      
      const result2 = mockContract.registerEquipment("Type2", "Model2", "Serial2", 200000, "Excellent", "Location2")
      expect(result2.success).toBe(2)
      
      const result3 = mockContract.registerEquipment("Type3", "Model3", "Serial3", 300000, "Fair", "Location3")
      expect(result3.success).toBe(3)
    })
  })
  
  describe("Equipment Status Management", () => {
    beforeEach(() => {
      // Register test equipment
      mockContract.registerEquipment("Excavator", "CAT 320D", "CAT123", 250000, "Excellent", "Site A")
    })
    
    it("should update equipment status successfully", () => {
      const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const result = mockContract.updateEquipmentStatus(1, "Maintenance", owner)
      
      expect(result.success).toBe(true)
      
      const equipment = mockContract.getEquipment(1)
      expect(equipment.status).toBe("Maintenance")
    })
    
    it("should reject unauthorized status updates", () => {
      const unauthorizedUser = "ST2DIFFERENT-USER"
      const result = mockContract.updateEquipmentStatus(1, "Maintenance", unauthorizedUser)
      
      expect(result.error).toBe("ERR-NOT-AUTHORIZED")
    })
    
    it("should reject invalid status values", () => {
      const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const result = mockContract.updateEquipmentStatus(1, "InvalidStatus", owner)
      
      expect(result.error).toBe("ERR-INVALID-INPUT")
    })
    
    it("should reject updates for non-existent equipment", () => {
      const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const result = mockContract.updateEquipmentStatus(999, "Maintenance", owner)
      
      expect(result.error).toBe("ERR-EQUIPMENT-NOT-FOUND")
    })
  })
  
  describe("Equipment Transfer", () => {
    beforeEach(() => {
      // Register test equipment
      mockContract.registerEquipment("Excavator", "CAT 320D", "CAT123", 250000, "Excellent", "Site A")
    })
    
    it("should transfer equipment ownership successfully", () => {
      const currentOwner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const newOwner = "ST2NEW-OWNER-ADDRESS"
      
      const result = mockContract.transferEquipment(1, newOwner, currentOwner)
      expect(result.success).toBe(true)
      
      const equipment = mockContract.getEquipment(1)
      expect(equipment.owner).toBe(newOwner)
    })
    
    it("should reject unauthorized transfers", () => {
      const unauthorizedUser = "ST2UNAUTHORIZED-USER"
      const newOwner = "ST3NEW-OWNER"
      
      const result = mockContract.transferEquipment(1, newOwner, unauthorizedUser)
      expect(result.error).toBe("ERR-NOT-AUTHORIZED")
    })
    
    it("should reject transfer of non-available equipment", () => {
      const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const newOwner = "ST2NEW-OWNER"
      
      // First set equipment to leased status
      mockContract.updateEquipmentStatus(1, "Leased", owner)
      
      // Try to transfer
      const result = mockContract.transferEquipment(1, newOwner, owner)
      expect(result.error).toBe("ERR-INVALID-STATUS")
    })
  })
  
  describe("Equipment Queries", () => {
    beforeEach(() => {
      // Register multiple test equipment
      mockContract.registerEquipment("Excavator", "CAT 320D", "CAT123", 250000, "Excellent", "Site A")
      mockContract.registerEquipment("Bulldozer", "CAT D6T", "CAT456", 300000, "Good", "Site B")
    })
    
    it("should retrieve equipment details correctly", () => {
      const equipment1 = mockContract.getEquipment(1)
      expect(equipment1.equipmentType).toBe("Excavator")
      expect(equipment1.model).toBe("CAT 320D")
      
      const equipment2 = mockContract.getEquipment(2)
      expect(equipment2.equipmentType).toBe("Bulldozer")
      expect(equipment2.model).toBe("CAT D6T")
    })
    
    it("should return null for non-existent equipment", () => {
      const equipment = mockContract.getEquipment(999)
      expect(equipment).toBeNull()
    })
    
    it("should track owner equipment counts correctly", () => {
      const owner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
      const count = mockContractState.ownerEquipmentCount.get(owner)
      expect(count).toBe(2) // Two equipment registered
    })
  })
  
  describe("Edge Cases and Error Handling", () => {
    it("should handle equipment registration with boundary values", () => {
      // Test with minimum valid values
      const result = mockContract.registerEquipment(
          "A", // Minimum length
          "B", // Minimum length
          "C", // Minimum length
          1, // Minimum price
          "Poor", // Valid condition
          "D", // Minimum location
      )
      expect(result.success).toBe(1)
    })
    
    it("should handle multiple rapid registrations", () => {
      const results = []
      for (let i = 0; i < 10; i++) {
        results.push(
            mockContract.registerEquipment(`Type${i}`, `Model${i}`, `Serial${i}`, 100000 + i, "Good", `Location${i}`),
        )
      }
      
      // All should succeed with sequential IDs
      results.forEach((result, index) => {
        expect(result.success).toBe(index + 1)
      })
    })
    
    it("should maintain data consistency during operations", () => {
      // Register equipment
      const equipmentId = mockContract.registerEquipment(
          "Crane",
          "Liebherr LTM",
          "LIE789",
          500000,
          "Excellent",
          "Port A",
      ).success
      
      // Verify all related data structures are updated
      expect(mockContractState.equipmentRegistry.has(equipmentId)).toBe(true)
      expect(mockContractState.equipmentOwnership.has(equipmentId)).toBe(true)
      expect(mockContractState.equipmentSerialLookup.has("LIE789")).toBe(true)
      
      const serialLookup = mockContractState.equipmentSerialLookup.get("LIE789")
      expect(serialLookup.equipmentId).toBe(equipmentId)
    })
  })
})
