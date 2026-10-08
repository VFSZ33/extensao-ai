import type { FormDefinition } from "@/lib/form-definition";

import { autodromoOfferForm } from "@/lib/form-definitions/autodromo-offer";
import { autodromoSectionForm } from "@/lib/form-definitions/autodromo-section";

export const formDefinitions: FormDefinition[] = [
  autodromoOfferForm,
  autodromoSectionForm,
];
