import { describe, expect, it } from "vitest";
import { localizeCanonicalActivityName } from "./activityOptionLocalization";
import {
  defaultMushroomPickingMetadata,
  isMushroomPickingLabel,
  mushroomPickingMetadataFromForm,
  mushroomPickingPostEventContract,
  mushroomPickingPostEventQuestions,
} from "./mushroomPicking";

describe("mushroom picking activity contract", () => {
  it("recognizes every canonical language label", () => {
    for (const label of [
      "Идём за грибами",
      "Йдемо по гриби",
      "Jdeme na houby",
      "Mushroom picking",
      "Idziemy na grzyby",
      "Ideme na huby",
    ]) {
      expect(isMushroomPickingLabel(label), label).toBe(true);
    }
  });

  it("localizes the canonical Activity into all six UI languages", () => {
    const source = ["Идём за грибами"];
    expect(localizeCanonicalActivityName("nature", source, "ru")).toBe("Идём за грибами");
    expect(localizeCanonicalActivityName("nature", source, "uk")).toBe("Йдемо по гриби");
    expect(localizeCanonicalActivityName("nature", source, "cs")).toBe("Jdeme na houby");
    expect(localizeCanonicalActivityName("nature", source, "en")).toBe("Mushroom picking");
    expect(localizeCanonicalActivityName("nature", source, "pl")).toBe("Idziemy na grzyby");
    expect(localizeCanonicalActivityName("nature", source, "sk")).toBe("Ideme na huby");
  });

  it("parses structured Create/Edit metadata without requiring a schema change", () => {
    const data = new FormData();
    data.set("mushroomDuration", "240");
    data.set("mushroomDifficulty", "demanding");
    data.set("mushroomExpertMode", "required");
    data.set("mushroomTransportMode", "carpool");
    data.set("mushroomVerificationMode", "planned");
    data.append("mushroomEquipment", "basket");
    data.append("mushroomEquipment", "boots");
    data.set("mushroomChildrenPolicy", "welcome");
    data.set("mushroomPetsPolicy", "not_recommended");

    expect(mushroomPickingMetadataFromForm(data)).toEqual({
      expertMode: "required",
      transportMode: "carpool",
      verificationMode: "planned",
      difficulty: "demanding",
      durationMinutes: 240,
      equipment: ["basket", "boots"],
      childrenPolicy: "welcome",
      petsPolicy: "not_recommended",
    });
  });

  it("defines POSTEVENT extension hooks while keeping durable role reputation in Activ018", () => {
    expect(mushroomPickingPostEventQuestions({
      ...defaultMushroomPickingMetadata,
      expertMode: "required",
      verificationMode: "planned",
      transportMode: "driver_needed",
    }).map((question) => question.id)).toEqual([
      "expert_guidance_provided",
      "mushroom_check_provided",
      "transport_fulfilled",
    ]);
    expect(mushroomPickingPostEventContract.engine).toBe("existing_postevent");
    expect(mushroomPickingPostEventContract.activitySpecificAnswersNeedDurableExtension).toBe(true);
    expect(mushroomPickingPostEventContract.roleReputationOwner).toBe("Activ018");
  });
});
