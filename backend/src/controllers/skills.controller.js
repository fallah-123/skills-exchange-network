// Handles authenticated skill catalogue and own skill-assignment requests.
import * as service from '../services/skills.service.js';
import { validatePathId } from '../validators/common.validator.js';
import { validateSkillBody, validateSkillType } from '../validators/skills.validator.js';

/**
 * Returns all standard catalogue skills.
 * @param {import('express').Request} req Authenticated request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends catalogue skills.
 * @throws {Error} When the database query fails.
 */
export async function listCatalogue(req, res) {
  res.status(200).json({ data: await service.getCatalogue(req.app.locals.pool) });
}

/**
 * Returns the caller's independent offered and wanted lists.
 * @param {import('express').Request} req Authenticated request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the caller's skill lists.
 * @throws {Error} When a database query fails.
 */
export async function listMine(req, res) {
  res.status(200).json({ data: await service.getMine(req.app.locals.pool, req.userId) });
}

/**
 * Adds one catalogue skill to the selected list.
 * @param {import('express').Request} req Skill assignment request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the added skill.
 * @throws {AppError} When input is invalid, the skill is unknown, or duplicated.
 */
export async function add(req, res) {
  const skillType = validateSkillType(req.params.skillType);
  const skillId = validateSkillBody(req.body);
  const skill = await service.addSkill(req.app.locals.pool, req.userId, skillId, skillType);
  res.status(201).json({ data: skill, message: 'Skill added.' });
}

/**
 * Removes one skill from the selected caller-owned list.
 * @param {import('express').Request} req Skill removal URL.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the removal confirmation.
 * @throws {AppError} When the id is invalid or assignment is missing.
 */
export async function remove(req, res) {
  const skillType = validateSkillType(req.params.skillType);
  const skillId = validatePathId(req.params.skillId, 'skillId');
  await service.removeSkill(req.app.locals.pool, req.userId, skillId, skillType);
  res.status(200).json({ message: 'Skill removed.' });
}
