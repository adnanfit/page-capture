jQuery(document).ready(function ($) {
  let capturing = false;
  let capturedCanvas = null;

  // Helper function to get header and footer elements
  function getHeaderFooter() {
    const header = $(
      'header, .header, [role="banner"], .site-header, #header, .navbar, .nav-fixed, #masthead'
    ).first();
    const footer = $(
      'footer, .footer, [role="contentinfo"], .site-footer, #footer'
    ).first();
    return { header, footer };
  }

  // Helper function to capture specific element
  async function captureElement(element) {
    if (!element || !element.length) return null;

    const canvas = await html2canvas(element[0], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#FFFFFF",
    });

    return {
      canvas: canvas,
      height: element.outerHeight(),
    };
  }

  async function captureSection(scrollTop) {
    const { header, footer } = getHeaderFooter();

    // Temporarily hide header and footer
    header.css("opacity", "0");
    footer.css("opacity", "0");

    // Capture main content
    const canvas = await html2canvas(document.documentElement, {
      scrollY: -scrollTop,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: window.innerHeight,
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#FFFFFF",
      scale: 2,
      onclone: function (clonedDoc) {
        $(clonedDoc)
          .find(
            "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
          )
          .remove();
      },
    });

    // Restore header and footer
    header.css("opacity", "");
    footer.css("opacity", "");

    return canvas;
  }

  async function startCapture(clickedElement) {
    if (capturing) return;
    capturing = true;

    const $clickedButton = $(clickedElement);
    $clickedButton.addClass("capturing");
    $("#capture-button, .capture-button-inline").prop("disabled", true);

    try {
      const { header, footer } = getHeaderFooter();
      const headerCapture = await captureElement(header);
      const footerCapture = await captureElement(footer);

      const originalScrollPos = window.pageYOffset;
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      const finalCanvas = document.createElement("canvas");
      const ctx = finalCanvas.getContext("2d");

      finalCanvas.width = document.documentElement.clientWidth * 2; // Scale factor of 2
      finalCanvas.height = totalHeight * 2; // Scale factor of 2

      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const viewportHeight = window.innerHeight;
      let currentScroll = 0;

      while (currentScroll < totalHeight) {
        const sectionCanvas = await captureSection(currentScroll);
        ctx.drawImage(
          sectionCanvas,
          0,
          currentScroll * 2, // Scale factor of 2
          sectionCanvas.width,
          sectionCanvas.height
        );

        currentScroll += viewportHeight;
        if (currentScroll < totalHeight) {
          window.scrollTo(0, currentScroll);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      window.scrollTo(0, originalScrollPos);
      capturedCanvas = finalCanvas;
      showDownloadPopup();
    } catch (error) {
      console.error("Capture failed:", error);
      alert("Failed to capture page. Please try again.");
    } finally {
      $clickedButton.removeClass("capturing");
      $("#capture-button, .capture-button-inline").prop("disabled", false);
      capturing = false;
    }
  }

  async function convertToPdf() {
    if (!capturedCanvas) {
      alert("No capture available. Please capture the page first.");
      return;
    }

    showProcessingOverlay();

    try {
      const { header, footer } = getHeaderFooter();
      const headerCapture = await captureElement(header);
      const footerCapture = await captureElement(footer);

      const { jsPDF } = window.jspdf;

      // A4 dimensions in mm
      const a4Width = 210;
      const a4Height = 297;

      // Set margins
      const margins = {
        top: headerCapture ? 40 : 10,
        bottom: footerCapture ? 40 : 10,
        left: 10,
        right: 10,
      };

      // Calculate content area
      const contentWidth = a4Width - margins.left - margins.right;
      const contentHeight = a4Height - margins.top - margins.bottom;

      // Calculate scale for content
      const scale = contentWidth / (capturedCanvas.width / 2); // Divide by 2 due to scale factor
      const scaledHeight = (capturedCanvas.height / 2) * scale; // Divide by 2 due to scale factor

      // Create PDF
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Calculate pages needed
      const totalPages = Math.ceil(scaledHeight / contentHeight);

      // Process each page
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Add header if exists
        if (headerCapture) {
          const headerImage = headerCapture.canvas.toDataURL("image/jpeg", 1.0);
          pdf.addImage(
            headerImage,
            "JPEG",
            margins.left,
            5,
            contentWidth,
            30,
            "",
            "FAST"
          );
        }

        // Add content section
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");

        const sourceY = ((page * contentHeight) / scale) * 2; // Multiply by 2 due to scale factor
        const sourceHeight = Math.min(
          (contentHeight / scale) * 2,
          capturedCanvas.height - sourceY
        );

        tempCanvas.width = capturedCanvas.width;
        tempCanvas.height = sourceHeight;

        tempCtx.drawImage(
          capturedCanvas,
          0,
          sourceY,
          capturedCanvas.width,
          sourceHeight,
          0,
          0,
          capturedCanvas.width,
          sourceHeight
        );

        // Add content to PDF
        pdf.addImage(
          tempCanvas.toDataURL("image/jpeg", 1.0),
          "JPEG",
          margins.left,
          margins.top,
          contentWidth,
          (sourceHeight / 2) * scale, // Divide by 2 due to scale factor
          "",
          "FAST"
        );

        // Add footer if exists
        if (footerCapture) {
          const footerImage = footerCapture.canvas.toDataURL("image/jpeg", 1.0);
          pdf.addImage(
            footerImage,
            "JPEG",
            margins.left,
            a4Height - 35,
            contentWidth,
            30,
            "",
            "FAST"
          );
        }

        tempCanvas.remove();
      }

      pdf.save(document.title + "-capture.pdf");
      hideProcessingOverlay();
    } catch (error) {
      console.error("PDF conversion failed:", error);
      alert("Failed to convert to PDF. Please try again.");
      hideProcessingOverlay();
    }
  }

  function showProcessingOverlay() {
    $(`
        <div id="processing-overlay">
          <div class="processing-content">
            <div class="spinner"></div>
            <p>Converting to PDF...</p>
          </div>
        </div>
      `).appendTo("body");
  }

  function hideProcessingOverlay() {
    $("#processing-overlay").fadeOut(function () {
      $(this).remove();
    });
  }

  function showDownloadPopup() {
    $("#download-popup").remove();

    const popup = $(`
        <div id="download-popup">
          <div class="download-content">
            <h3>Capture Complete!</h3>
            <div class="download-buttons">
              <button id="download-png" class="download-btn">Download as PNG</button>
              <button id="download-pdf" class="download-btn">Download as PDF</button>
            </div>
          </div>
        </div>
      `).appendTo("body");

    $("#download-png").click(function () {
      capturedCanvas.toBlob(
        function (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = (document.title || "page-capture") + ".png";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          popup.fadeOut(function () {
            $(this).remove();
          });
        },
        "image/png",
        1.0
      );
    });

    $("#download-pdf").click(function () {
      convertToPdf();
      popup.fadeOut(function () {
        $(this).remove();
      });
    });

    popup.click(function (e) {
      if ($(e.target).is("#download-popup")) {
        popup.fadeOut(function () {
          $(this).remove();
        });
      }
    });
  }

  // Bind click handlers
  $("#capture-button, .capture-button-inline").click(function () {
    startCapture(this);
  });
});
