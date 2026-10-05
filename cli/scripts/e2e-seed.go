// e2e-seed.go — copied into the OrcaRouter worktree (.dev/o2) by
// dev-backend.mjs and built THERE, so it uses main's own model structs, Mongo
// driver and secret encryption. A hand-written schema or cipher in this repo
// would be one more copy of the contract to drift.
//
// It does the three things the server will not do for an unattended script:
// create the deferred tool tables (model/tool_schema_deferred.go leaves them
// to ops DDL), encrypt the platform key exactly as the providers page would,
// and write the tool where production keeps tools.
//
// THE MONGO DATABASE IS DROPPED FIRST. dev-backend.mjs names it after this
// worktree's own prefix on the shared container; never point it at a real one.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/toolrouter/platform"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func must(err error, what string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", what, err)
		os.Exit(1)
	}
}

func main() {
	// The tool tables live on the LOG database (model/tool_router_log_db.go).
	db, err := gorm.Open(mysql.Open(os.Getenv("E2E_LOG_DSN")), &gorm.Config{})
	must(err, "open log db")
	must(db.AutoMigrate(&model.ToolRun{}, &model.ToolRunRefundLedger{}, &model.ToolDemandEvent{}), "migrate tool tables")

	secret, err := platform.EncryptToolSecret(os.Getenv("E2E_PROVIDER_KEY"))
	must(err, "encrypt provider key")
	content, err := os.ReadFile(os.Getenv("E2E_UPSTREAM_FILE"))
	must(err, "read upstream file")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(os.Getenv("E2E_MONGO_DSN")))
	must(err, "connect mongo")
	defer client.Disconnect(ctx)
	mdb := client.Database(os.Getenv("E2E_MONGO_DB"))
	must(mdb.Drop(ctx), "drop e2e mongo db")

	provider := os.Getenv("E2E_PROVIDER")
	now := time.Now()
	_, err = mdb.Collection("tool_upstream_catalogs").InsertOne(ctx, bson.M{
		"_id": provider + "/e2e", "aggregator": provider, "upstream": "e2e",
		"display_name": "Dev Mock", "format": "yaml", "content": string(content),
		"tool_count": 1, "generated_at": now.UTC(),
	})
	must(err, "insert tool_upstream_catalogs")
	// Priced by upstream RATES, the way the providers page prices a whole
	// upstream: sell = upstream_list_usd × sell_rate, cost = × rate.
	_, err = mdb.Collection("tool_providers").InsertOne(ctx, bson.M{
		"_id": provider, "version": int64(1),
		"credential": bson.M{
			"provider": provider, "secret": secret, "credential_version": 1,
			"note": "e2e", "created_at": now.Unix(), "updated_at": now.Unix(), "updated_by": 1,
		},
		"rate": 1.0, "sell_rate": 1.5,
		"rates_created_at": now.Unix(), "rates_updated_at": now.Unix(), "rates_updated_by": 1,
	})
	must(err, "insert tool_providers")
	fmt.Println("seeded")
}
