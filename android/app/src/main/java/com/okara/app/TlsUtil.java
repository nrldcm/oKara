package com.okara.app;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Date;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocketFactory;

/**
 * Builds a self-signed TLS certificate at runtime so the LAN remote can be
 * served over HTTPS — browsers require a secure context for the phone-as-mic
 * getUserMedia. The cert is not trusted by any CA, so phones show a one-time
 * warning to accept (expected for self-signed on a LAN).
 */
final class TlsUtil {

    private TlsUtil() {}

    private static SSLServerSocketFactory cached;

    static synchronized SSLServerSocketFactory serverSocketFactory() throws Exception {
        if (cached != null) return cached;

        BouncyCastleProvider bc = new BouncyCastleProvider();

        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair keyPair = kpg.generateKeyPair();

        long now = System.currentTimeMillis();
        Date from = new Date(now - 24L * 60 * 60 * 1000);
        Date to = new Date(now + 3650L * 24 * 60 * 60 * 1000);
        X500Name subject = new X500Name("CN=okara.local");

        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                subject, BigInteger.valueOf(now), from, to, subject, keyPair.getPublic());
        builder.addExtension(Extension.subjectAlternativeName, false, new GeneralNames(new GeneralName[] {
                new GeneralName(GeneralName.dNSName, "okara.local"),
                new GeneralName(GeneralName.iPAddress, "0.0.0.0"),
        }));

        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA")
                .setProvider(bc).build(keyPair.getPrivate());
        X509Certificate cert = new JcaX509CertificateConverter()
                .setProvider(bc).getCertificate(builder.build(signer));

        char[] pass = "okara".toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, pass);
        ks.setKeyEntry("okara", keyPair.getPrivate(), pass, new X509Certificate[] { cert });

        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pass);

        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), null, new SecureRandom());
        cached = ctx.getServerSocketFactory();
        return cached;
    }
}
