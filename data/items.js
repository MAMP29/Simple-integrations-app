/** Catálogo en memoria — suficiente para el onboarding. */
const items = [
  {
    id: "cam-001",
    name: "Cámara mirrorless",
    description: "Cámara compacta ideal para eventos y viaje.",
    pricePerDay: 25,
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80&auto=format&fit=crop",
    available: true,
  },
  {
    id: "drn-002",
    name: "Drone 4K",
    description: "Drone con cámara estabilizada y autonomía media.",
    pricePerDay: 45,
    imageUrl:
      "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&q=80&auto=format&fit=crop",
    available: true,
  },
  {
    id: "prj-003",
    name: "Proyector portátil",
    description: "Proyector HD para presentaciones o cine en casa.",
    pricePerDay: 18,
    imageUrl:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80&auto=format&fit=crop",
    available: true,
  },
  {
    id: "spk-004",
    name: "Altavoz Bluetooth",
    description: "Altavoz resistente al agua, batería de larga duración.",
    pricePerDay: 12,
    imageUrl:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80&auto=format&fit=crop",
    available: true,
  },
];

function listItems() {
  return items.map(({ id, name, description, pricePerDay, imageUrl, available }) => ({
    id,
    name,
    description,
    pricePerDay,
    imageUrl,
    available,
  }));
}

function getItemById(id) {
  return items.find((item) => item.id === id) ?? null;
}

module.exports = { listItems, getItemById };
