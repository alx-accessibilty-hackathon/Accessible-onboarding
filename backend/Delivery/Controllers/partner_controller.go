package controllers

import (
	"net/http"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

// PartnerController: self-service partner sign-up.
type PartnerController struct {
	PartnerUc domain.PartnerSignupUsecaseI
}

func NewPartnerController(uc domain.PartnerSignupUsecaseI) *PartnerController {
	return &PartnerController{PartnerUc: uc}
}

// POST /api/v1/partners creates a partner with a working publishable key and an OAuth client.
// Public (no key): the partner guide's form calls it. The client secret is in this answer only.
func (pc *PartnerController) CreatePartnerController(c *gin.Context) {
	if pc == nil || pc.PartnerUc == nil {
		notImplemented(c)
		return
	}
	var req CreatePartnerRequest
	if !bindJSON(c, &req) {
		return
	}
	created, err := pc.PartnerUc.CreatePartner(c.Request.Context(), req.toDomain())
	if err != nil {
		respondError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store") // the answer holds the client secret
	c.JSON(http.StatusCreated, toCreatedPartnerDTO(created))
}
