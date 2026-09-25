-- Token criptografado do cartão Asaas não cabe em varchar(128).
ALTER TABLE "subscriptions" ALTER COLUMN "asaasCreditCardToken" TYPE VARCHAR(512);
